import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

type IncomingStep = {
  dayNumber: number;
  templateName: string;
  templateLanguage?: string;
  mediaUrl?: string | null;
  variableValues?: Record<string, string>;
};

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();
  const ownerId = user.id === 'local-development' ? null : user.id;

  try {
    if (req.method === 'GET') {
      const series = await serializeSeries(sb, ownerId);
      return res.status(200).json({ series });
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
        const { error: stepError } = await sb
          .from('message_series_steps')
          .upsert({
            id: crypto.randomUUID(),
            series_id: id,
            day_number: Number(step.dayNumber),
            template_name: step.templateName,
            template_language: step.templateLanguage,
            header_type: step.headerType || null,
            media_url: String(step.mediaUrl || '').trim() || null,
            variable_values: step.variableValues || {},
            active: true,
            updated_at: now,
          }, { onConflict: 'series_id,day_number', ignoreDuplicates: false });

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
