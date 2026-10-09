import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isAuthorizedCron(req: VercelRequest) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req.headers.authorization || '').trim();
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET' && String(req.query.keepalive || '') === '1') {
    if (!isAuthorizedCron(req)) {
      return res.status(401).json({ error: 'Unauthorized cron request.' });
    }

    try {
      const sb = supabaseAdmin();
      const { error } = await sb.from('campaigns').select('id').limit(1);
      if (error) throw error;

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        service: 'supabase-keepalive',
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Supabase keepalive failed.',
      });
    }
  }

  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();

  try {
    if (req.method === 'GET') {
      if (String(req.query.view || '').toLowerCase() === 'dashboard') {
        const { data, error } = await sb.rpc('get_dashboard_stats', {
          p_user_id: user.id === 'local-development' ? null : user.id,
          p_is_admin: user.role === 'admin',
        });
        if (error) throw error;
        return res.status(200).json({ dashboard: data || {} });
      }

      const { data, error } = await sb.rpc('get_campaign_history', {
        p_user_id: user.id === 'local-development' ? null : user.id,
        p_is_admin: user.role === 'admin',
        p_limit: 500,
      });
      if (error) throw error;

      return res.status(200).json({
        campaigns: Array.isArray(data) ? data : [],
      });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || req.body?.id || '').trim();
      const action = String(req.body?.action || '').trim().toLowerCase();

      if (!id) return res.status(400).json({ error: 'Campaign id is required.' });
      if (!['cancel', 'reschedule'].includes(action)) {
        return res.status(400).json({ error: 'Unsupported campaign action.' });
      }

      let ownershipQuery = sb
        .from('campaigns')
        .select('id, status, scheduled_at, created_by')
        .eq('id', id);

      if (user.id !== 'local-development') ownershipQuery = ownershipQuery.eq('created_by', user.id);

      const { data: campaign, error: campaignError } = await ownershipQuery.maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

      if (campaign.status !== 'scheduled') {
        return res.status(409).json({
          error: 'Only campaigns that are still scheduled can be changed.',
        });
      }

      if (action === 'cancel') {
        const now = new Date().toISOString();

        const { error } = await sb
          .from('campaigns')
          .update({
            status: 'canceled',
            canceled_at: now,
            scheduler_error: null,
          })
          .eq('id', id)
          .eq('status', 'scheduled');

        if (error) throw error;

        const { error: recipientsError } = await sb
          .from('campaign_recipients')
          .update({ status: 'Cancelled' })
          .eq('campaign_id', id)
          .eq('status', 'Queued');

        if (recipientsError) throw recipientsError;

        return res.status(200).json({ ok: true, status: 'canceled', canceledAt: now });
      }

      const nextScheduledAt = new Date(String(req.body?.scheduledAt || ''));
      if (Number.isNaN(nextScheduledAt.getTime())) {
        return res.status(400).json({ error: 'Enter a valid reschedule date and time.' });
      }
      if (nextScheduledAt.getTime() <= Date.now() + 60_000) {
        return res.status(400).json({ error: 'Rescheduled time must be at least 1 minute in the future.' });
      }
      if (nextScheduledAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Scheduled time cannot be more than 1 year in the future.' });
      }

      const timezone = String(req.body?.timezone || 'UTC').trim() || 'UTC';
      if (!validTimezone(timezone)) {
        return res.status(400).json({ error: 'Invalid timezone.' });
      }

      const { error } = await sb
        .from('campaigns')
        .update({
          scheduled_at: nextScheduledAt.toISOString(),
          timezone,
          canceled_at: null,
          scheduler_error: null,
        })
        .eq('id', id)
        .eq('status', 'scheduled');

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        status: 'scheduled',
        scheduledAt: nextScheduledAt.toISOString(),
        timezone,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to manage campaigns.',
    });
  }
}
