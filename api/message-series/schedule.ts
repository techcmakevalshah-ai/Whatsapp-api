import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { requireStaff } from '../../server/auth.js';
import { fetchSheetContacts } from '../../server/googleSheets.js';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const {
      name,
      seriesId,
      contactIds,
      startAt,
      timezone,
    } = req.body || {};

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

    const sb = supabaseAdmin();
    const ownerId = user.id === 'local-development' ? null : user.id;

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
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to schedule message series.',
    });
  }
}
