import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { requireStaff } from '../server/auth.js';
import { fetchSheetContacts } from '../server/googleSheets.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

type IncomingStep = {
  dayNumber: number;
  templateName: string;
  templateLanguage?: string;
  mediaUrl?: string | null;
  variableValues?: Record<string, string>;
};

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function validateSteps(steps: IncomingStep[]) {
  if (!Array.isArray(steps) || !steps.length) {
    throw new Error('Add at least one day to the message series.');
  }
  if (steps.length > 90) throw new Error('A message series can contain at most 90 days.');

  const days = steps.map((step) => Number(step.dayNumber)).sort((a, b) => a - b);
  for (let index = 0; index < days.length; index += 1) {
    if (!Number.isInteger(days[index]) || days[index] !== index + 1) {
      throw new Error('Series days must be continuous starting from Day 1.');
    }
  }
}

async function validateTemplates(sb: ReturnType<typeof supabaseAdmin>, steps: IncomingStep[]) {
  const { data: templates, error } = await sb
    .from('whatsapp_templates')
    .select('name, language, status, variables, header_type');

  if (error) throw error;

  const lookup = new Map(
    (templates || []).map((row: any) => [`${row.name}::${row.language}`, row]),
  );

  return steps.map((step) => {
    const language = String(step.templateLanguage || 'en');
    const template = lookup.get(`${step.templateName}::${language}`);

    if (!template || template.status !== 'APPROVED') {
      throw new Error(`Day ${step.dayNumber}: selected template is not approved.`);
    }

    const variables = Number(template.variables || 0);
    for (let index = 1; index <= variables; index += 1) {
      if (!String(step.variableValues?.[String(index)] || '').trim()) {
        throw new Error(`Day ${step.dayNumber}: template variable {{${index}}} is empty.`);
      }
    }

    if (
      template.header_type &&
      ['IMAGE', 'VIDEO'].includes(template.header_type) &&
      !String(step.mediaUrl || '').trim()
    ) {
      throw new Error(
        `Day ${step.dayNumber}: upload the required ${String(template.header_type).toLowerCase()}.`,
      );
    }

    return {
      ...step,
      templateLanguage: language,
      headerType: template.header_type || null,
    };
  });
}

async function serializeSeries(sb: ReturnType<typeof supabaseAdmin>, ownerId?: string | null) {
  let query = sb
    .from('message_series')
    .select('id, name, description, status, created_by, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (ownerId) query = query.eq('created_by', ownerId);

  const { data: seriesRows, error } = await query;
  if (error) throw error;

  const ids = (seriesRows || []).map((row: any) => row.id);
  let steps: any[] = [];

  if (ids.length) {
    const { data, error: stepsError } = await sb
      .from('message_series_steps')
      .select('id, series_id, day_number, template_name, template_language, header_type, media_url, variable_values, active')
      .in('series_id', ids)
      .eq('active', true)
      .order('day_number', { ascending: true });

    if (stepsError) throw stepsError;
    steps = data || [];
  }

  const bySeries = new Map<string, any[]>();
  for (const step of steps) {
    const list = bySeries.get(step.series_id) || [];
    list.push({
      id: step.id,
      dayNumber: step.day_number,
      templateName: step.template_name,
      templateLanguage: step.template_language,
      headerType: step.header_type,
      mediaUrl: step.media_url,
      variableValues: step.variable_values || {},
    });
    bySeries.set(step.series_id, list);
  }

  return (seriesRows || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: bySeries.get(row.id) || [],
  }));
}

async function serializeSchedules(sb: ReturnType<typeof supabaseAdmin>, ownerId?: string | null) {
  let query = sb
    .from('message_series_schedules')
    .select('id, series_id, name, status, timezone, start_at, next_run_at, total_days, runs_created, last_run_at, scheduler_error, created_at, message_series(name), message_series_schedule_recipients(count)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (ownerId) query = query.eq('created_by', ownerId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    seriesId: row.series_id,
    seriesName: row.message_series?.name || 'Message Series',
    name: row.name,
    status: row.status,
    timezone: row.timezone,
    startAt: row.start_at,
    nextRunAt: row.next_run_at,
    totalDays: row.total_days,
    runsCreated: row.runs_created,
    lastRunAt: row.last_run_at,
    schedulerError: row.scheduler_error,
    createdAt: row.created_at,
    totalRecipients: row.message_series_schedule_recipients?.[0]?.count || 0,
  }));
}

async function createSchedule(
  req: VercelRequest,
  res: VercelResponse,
  sb: ReturnType<typeof supabaseAdmin>,
  ownerId: string | null,
) {
  const { name, seriesId, contactIds, startAt, timezone } = req.body || {};

  if (!String(name || '').trim() || !seriesId || !Array.isArray(contactIds) || !contactIds.length) {
    return res.status(400).json({ error: 'Campaign name, message series and contacts are required.' });
  }

  const startDate = new Date(String(startAt || ''));
  if (Number.isNaN(startDate.getTime())) {
    return res.status(400).json({ error: 'Choose a valid first send date and time.' });
  }
  if (startDate.getTime() <= Date.now() + 60_000) {
    return res.status(400).json({ error: 'First send time must be at least 1 minute in the future.' });
  }

  const timezoneValue = String(timezone || 'UTC').trim() || 'UTC';
  if (!validTimezone(timezoneValue)) {
    return res.status(400).json({ error: 'Invalid timezone.' });
  }

  let seriesQuery = sb
    .from('message_series')
    .select('id, name, status, created_by')
    .eq('id', String(seriesId))
    .eq('status', 'READY');

  if (ownerId) seriesQuery = seriesQuery.eq('created_by', ownerId);

  const { data: series, error: seriesError } = await seriesQuery.maybeSingle();
  if (seriesError) throw seriesError;
  if (!series) return res.status(404).json({ error: 'Ready message series not found.' });

  const { data: steps, error: stepsError } = await sb
    .from('message_series_steps')
    .select('day_number')
    .eq('series_id', series.id)
    .eq('active', true)
    .order('day_number', { ascending: true });

  if (stepsError) throw stepsError;
  if (!steps?.length) return res.status(400).json({ error: 'This message series has no active days.' });
  if (steps.length > 90) return res.status(400).json({ error: 'Message series exceeds the 90-day limit.' });

  for (let index = 0; index < steps.length; index += 1) {
    if (Number(steps[index].day_number) !== index + 1) {
      return res.status(400).json({ error: 'Message series days must be continuous from Day 1.' });
    }
  }

  const liveContacts = await fetchSheetContacts();
  const requestedIds = new Set(contactIds.map(String));
  const selectedContacts = liveContacts.filter(
    (contact) => requestedIds.has(contact.id) && contact.status === 'Active',
  );

  if (!selectedContacts.length) {
    return res.status(400).json({ error: 'Select at least one active contact.' });
  }
  if (selectedContacts.length !== requestedIds.size) {
    return res.status(400).json({
      error: 'One or more selected contacts changed or are inactive. Refresh contacts and try again.',
    });
  }

  const scheduleId = crypto.randomUUID();
  const { error: scheduleError } = await sb.from('message_series_schedules').insert({
    id: scheduleId,
    series_id: series.id,
    name: String(name).trim().slice(0, 120),
    timezone: timezoneValue,
    start_at: startDate.toISOString(),
    next_run_at: startDate.toISOString(),
    total_days: steps.length,
    runs_created: 0,
    status: 'active',
    created_by: ownerId,
  });

  if (scheduleError) throw scheduleError;

  const recipients = selectedContacts.map((contact) => ({
    id: crypto.randomUUID(),
    schedule_id: scheduleId,
    phone: contact.phone,
    initial_name: contact.name,
    initial_category: contact.category,
  }));

  const { error: recipientsError } = await sb
    .from('message_series_schedule_recipients')
    .insert(recipients);

  if (recipientsError) throw recipientsError;

  return res.status(201).json({
    ok: true,
    scheduleId,
    seriesId: series.id,
    seriesName: series.name,
    totalDays: steps.length,
    eligibleCount: selectedContacts.length,
    nextRunAt: startDate.toISOString(),
  });
}

async function updateSchedule(
  req: VercelRequest,
  res: VercelResponse,
  sb: ReturnType<typeof supabaseAdmin>,
  ownerId: string | null,
) {
  const id = String(req.query.id || req.body?.id || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();

  if (!id) return res.status(400).json({ error: 'Series schedule id is required.' });
  if (!['pause', 'resume', 'cancel'].includes(action)) {
    return res.status(400).json({ error: 'Unsupported series schedule action.' });
  }

  let ownership = sb
    .from('message_series_schedules')
    .select('id, status, runs_created, total_days, created_by')
    .eq('id', id);

  if (ownerId) ownership = ownership.eq('created_by', ownerId);

  const { data: schedule, error: scheduleError } = await ownership.maybeSingle();
  if (scheduleError) throw scheduleError;
  if (!schedule) return res.status(404).json({ error: 'Series schedule not found.' });

  if (action === 'pause') {
    if (schedule.status !== 'active') {
      return res.status(409).json({ error: 'Only an active series can be paused.' });
    }

    const { error } = await sb
      .from('message_series_schedules')
      .update({ status: 'paused', locked_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'active');

    if (error) throw error;
    return res.status(200).json({ ok: true, status: 'paused' });
  }

  if (action === 'resume') {
    if (schedule.status !== 'paused') {
      return res.status(409).json({ error: 'Only a paused series can be resumed.' });
    }

    const { data, error } = await sb.rpc('resume_message_series_schedule', {
      p_schedule_id: id,
    });

    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'This series cannot be resumed.' });

    return res.status(200).json({
      ok: true,
      status: data.status,
      nextRunAt: data.next_run_at,
    });
  }

  if (!['active', 'paused'].includes(schedule.status)) {
    return res.status(409).json({ error: 'This series can no longer be canceled.' });
  }

  const { error } = await sb
    .from('message_series_schedules')
    .update({
      status: 'canceled',
      next_run_at: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  return res.status(200).json({ ok: true, status: 'canceled' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();
  const ownerId = user.id === 'local-development' ? null : user.id;

  try {
    if (req.method === 'GET') {
      if (String(req.query.view || '') === 'schedules') {
        const schedules = await serializeSchedules(sb, ownerId);
        return res.status(200).json({ schedules });
      }

      const series = await serializeSeries(sb, ownerId);
      return res.status(200).json({ series });
    }

    if (req.method === 'POST' && String(req.body?.action || '') === 'schedule') {
      return await createSchedule(req, res, sb, ownerId);
    }

    if (req.method === 'PATCH' && String(req.body?.scope || '') === 'schedule') {
      return await updateSchedule(req, res, sb, ownerId);
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const id = req.method === 'PATCH'
        ? String(req.query.id || req.body?.id || '').trim()
        : crypto.randomUUID();

      if (req.method === 'PATCH' && !id) {
        return res.status(400).json({ error: 'Message series id is required.' });
      }

      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim() || null;
      const incomingSteps = Array.isArray(req.body?.steps) ? req.body.steps as IncomingStep[] : [];

      if (!name) return res.status(400).json({ error: 'Series name is required.' });
      validateSteps(incomingSteps);
      const validatedSteps = await validateTemplates(sb, incomingSteps);

      if (req.method === 'PATCH') {
        let ownership = sb
          .from('message_series')
          .select('id, created_by')
          .eq('id', id);
        if (ownerId) ownership = ownership.eq('created_by', ownerId);

        const { data: existing, error: existingError } = await ownership.maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return res.status(404).json({ error: 'Message series not found.' });
      }

      const now = new Date().toISOString();

      const { error: seriesError } = await sb
        .from('message_series')
        .upsert({
          id,
          name: name.slice(0, 120),
          description,
          status: 'READY',
          created_by: ownerId,
          updated_at: now,
        });

      if (seriesError) throw seriesError;

      const keepDays = validatedSteps.map((step) => Number(step.dayNumber));
      const { error: deactivateError } = await sb
        .from('message_series_steps')
        .update({ active: false, updated_at: now })
        .eq('series_id', id)
        .not('day_number', 'in', `(${keepDays.join(',')})`);

      if (deactivateError) throw deactivateError;

      for (const step of validatedSteps) {
        const { data: existingStep, error: existingStepError } = await sb
          .from('message_series_steps')
          .select('id')
          .eq('series_id', id)
          .eq('day_number', Number(step.dayNumber))
          .maybeSingle();

        if (existingStepError) throw existingStepError;

        const stepPayload = {
          series_id: id,
          day_number: Number(step.dayNumber),
          template_name: step.templateName,
          template_language: step.templateLanguage,
          header_type: step.headerType || null,
          media_url: String(step.mediaUrl || '').trim() || null,
          variable_values: step.variableValues || {},
          active: true,
          updated_at: now,
        };

        const { error: stepError } = existingStep
          ? await sb.from('message_series_steps').update(stepPayload).eq('id', existingStep.id)
          : await sb.from('message_series_steps').insert({ id: crypto.randomUUID(), ...stepPayload });

        if (stepError) throw stepError;
      }

      const allSeries = await serializeSeries(sb, ownerId);
      const series = allSeries.find((item: any) => item.id === id);
      return res.status(req.method === 'POST' ? 201 : 200).json({ series });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Message series id is required.' });

      let query = sb
        .from('message_series')
        .update({ status: 'INACTIVE', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (ownerId) query = query.eq('created_by', ownerId);

      const { error } = await query;
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to manage message series.',
    });
  }
}
