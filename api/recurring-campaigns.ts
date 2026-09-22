import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();

  try {
    if (req.method === 'GET') {
      let query = sb
        .from('recurring_campaigns')
        .select('id, name, template_name, status, timezone, start_at, next_run_at, total_days, runs_created, last_run_at, scheduler_error, created_at, recurring_campaign_recipients(count)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (user.id !== 'local-development') query = query.eq('created_by', user.id);

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({
        recurringCampaigns: (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          templateName: row.template_name,
          status: row.status,
          timezone: row.timezone,
          startAt: row.start_at,
          nextRunAt: row.next_run_at,
          totalDays: row.total_days,
          runsCreated: row.runs_created,
          lastRunAt: row.last_run_at,
          schedulerError: row.scheduler_error,
          createdAt: row.created_at,
          totalRecipients: row.recurring_campaign_recipients?.[0]?.count || 0,
        })),
      });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || req.body?.id || '').trim();
      const action = String(req.body?.action || '').trim().toLowerCase();

      if (!id) return res.status(400).json({ error: 'Recurring campaign id is required.' });
      if (!['pause', 'resume', 'cancel'].includes(action)) {
        return res.status(400).json({ error: 'Unsupported recurring campaign action.' });
      }

      let query = sb
        .from('recurring_campaigns')
        .select('id, status, runs_created, total_days, created_by')
        .eq('id', id);

      if (user.id !== 'local-development') query = query.eq('created_by', user.id);

      const { data: series, error: seriesError } = await query.maybeSingle();
      if (seriesError) throw seriesError;
      if (!series) return res.status(404).json({ error: 'Recurring campaign not found.' });

      if (action === 'pause') {
        if (series.status !== 'active') {
          return res.status(409).json({ error: 'Only an active recurring campaign can be paused.' });
        }

        const { error } = await sb
          .from('recurring_campaigns')
          .update({
            status: 'paused',
            locked_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('status', 'active');

        if (error) throw error;
        return res.status(200).json({ ok: true, status: 'paused' });
      }

      if (action === 'resume') {
        if (series.status !== 'paused') {
          return res.status(409).json({ error: 'Only a paused recurring campaign can be resumed.' });
        }

        const { data, error } = await sb.rpc('resume_recurring_campaign', { p_series_id: id });
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'This recurring campaign cannot be resumed.' });

        return res.status(200).json({
          ok: true,
          status: data.status,
          nextRunAt: data.next_run_at,
        });
      }

      if (!['active', 'paused'].includes(series.status)) {
        return res.status(409).json({ error: 'This recurring campaign can no longer be canceled.' });
      }

      const { error } = await sb
        .from('recurring_campaigns')
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
      error: error instanceof Error ? error.message : 'Unable to manage recurring campaigns.',
    });
  }
}
