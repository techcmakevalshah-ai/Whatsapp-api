import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './supabaseAdmin.js';

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function reminderTableMissing(error: any) {
  const text = String(error?.message || error?.code || error || '');
  return /app_reminders|PGRST205|42P01|schema cache/i.test(text);
}

function serialize(row: any) {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    note: row.note || null,
    remindAt: String(row.remind_at),
    status: String(row.status || 'pending'),
    snoozeCount: Number(row.snooze_count || 0),
    contactSource: row.contact_source || null,
    contactId: row.contact_id || null,
    flowluId: Number(row.flowlu_id || 0) || null,
    contactName: row.contact_name || null,
    contactPhone: row.contact_phone || null,
    completedAt: row.completed_at || null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

function migrationRequired(res: VercelResponse) {
  return res.status(503).json({
    error: 'Reminder database is not ready yet. Run supabase/migrations/004_app_reminders.sql in the Supabase SQL Editor once, then refresh the app.',
  });
}

export async function handleReminderRequest(
  req: VercelRequest,
  res: VercelResponse,
  user: { id: string },
  action: string,
) {
  const sb = supabaseAdmin();
  const userId = isUuid(user?.id) ? String(user.id) : null;

  try {
    if (req.method === 'GET' && action === 'reminders') {
      const scope = String(req.query.scope || 'pending').toLowerCase();
      let query = sb
        .from('app_reminders')
        .select('*')
        .order('remind_at', { ascending: true })
        .limit(200);

      if (userId) query = query.eq('assigned_to', userId);
      else query = query.is('assigned_to', null);

      if (scope !== 'all') query = query.eq('status', 'pending');

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ reminders: (data || []).map(serialize) });
    }

    if (req.method === 'POST' && action === 'reminder-create') {
      const body = req.body || {};
      const title = String(body.title || '').trim();
      const note = String(body.note || '').trim();
      const remindAt = new Date(String(body.remindAt || ''));

      if (!title) return res.status(400).json({ error: 'Enter a reminder title.' });
      if (Number.isNaN(remindAt.getTime())) return res.status(400).json({ error: 'Choose a valid reminder date and time.' });
      if (remindAt.getTime() < Date.now() - 30_000) {
        return res.status(400).json({ error: 'Reminder time cannot be in the past.' });
      }

      const contactSource = ['flowlu', 'sheet'].includes(String(body.contactSource || ''))
        ? String(body.contactSource)
        : null;

      const payload = {
        title: title.slice(0, 180),
        note: note ? note.slice(0, 2000) : null,
        remind_at: remindAt.toISOString(),
        status: 'pending',
        created_by: userId,
        assigned_to: userId,
        contact_source: contactSource,
        contact_id: body.contactId ? String(body.contactId).slice(0, 200) : null,
        flowlu_id: Number(body.flowluId || 0) || null,
        contact_name: body.contactName ? String(body.contactName).slice(0, 240) : null,
        contact_phone: body.contactPhone ? String(body.contactPhone).replace(/\D/g, '').slice(0, 30) : null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await sb
        .from('app_reminders')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(201).json({ reminder: serialize(data) });
    }

    if (req.method === 'PATCH' && action === 'reminder-update') {
      const body = req.body || {};
      const id = String(body.id || req.query.id || '').trim();
      const reminderAction = String(body.reminderAction || '').trim().toLowerCase();
      if (!id) return res.status(400).json({ error: 'Reminder id is required.' });

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (reminderAction === 'complete') {
        update.status = 'completed';
        update.completed_at = new Date().toISOString();
      } else if (reminderAction === 'cancel') {
        update.status = 'cancelled';
        update.completed_at = null;
      } else if (reminderAction === 'snooze') {
        const explicit = body.remindAt ? new Date(String(body.remindAt)) : null;
        const minutes = Math.max(1, Math.min(43_200, Number(body.minutes || 60)));
        const next = explicit && !Number.isNaN(explicit.getTime())
          ? explicit
          : new Date(Date.now() + minutes * 60_000);
        if (Number.isNaN(next.getTime()) || next.getTime() <= Date.now()) {
          return res.status(400).json({ error: 'Choose a future snooze time.' });
        }
        update.status = 'pending';
        update.remind_at = next.toISOString();
        update.completed_at = null;
        update.snooze_count = Number(body.snoozeCount || 0) + 1;
      } else {
        return res.status(400).json({ error: 'Unknown reminder action.' });
      }

      let query = sb
        .from('app_reminders')
        .update(update)
        .eq('id', id);
      if (userId) query = query.eq('assigned_to', userId);
      else query = query.is('assigned_to', null);

      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Reminder not found.' });
      return res.status(200).json({ reminder: serialize(data) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (reminderTableMissing(error)) return migrationRequired(res);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to process reminder.',
    });
  }
}
