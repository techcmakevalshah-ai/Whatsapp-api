import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();
  const ownerId = user.id === 'local-development' ? null : user.id;

  try {
    if (req.method === 'GET') {
      let query = sb
        .from('message_series_schedules')
        .select('id, series_id, name, status, timezone, start_at, next_run_at, total_days, runs_created, last_run_at, scheduler_error, created_at, message_series(name), message_series_schedule_recipients(count)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (ownerId) query = query.eq('created_by', ownerId);

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({
        schedules: (data || []).map((row: any) => ({
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
        })),
      });
    }

    if (req.method === 'PATCH') {
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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to manage message series schedules.',
    });
  }
}
