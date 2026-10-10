import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import {
  createFlowluTask,
  fetchFlowluTasks,
  updateFlowluTask,
  type FlowluTaskStatus,
} from '../server/flowluTasks.js';
import {
  endTaskTimer,
  getTaskTimerSnapshot,
  listTaskTimerHistory,
  startTaskTimer,
} from '../server/flowluTaskTimers.js';

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

function flowluTaskAction(req: VercelRequest) {
  return String(req.query.action || req.body?.action || '').trim().toLowerCase();
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
  const taskAction = flowluTaskAction(req);

  try {
    if (req.method === 'GET' && taskAction === 'flowlu-tasks') {
      const statusRaw = Number(req.query.status || 0);
      const responsibleId = Number(req.query.responsibleId || 0) || undefined;
      const result = await fetchFlowluTasks({
        search: String(req.query.search || '').trim() || undefined,
        responsibleId,
        status: [1, 3, 4, 5].includes(statusRaw) ? statusRaw : undefined,
        includeCompleted: String(req.query.includeCompleted || '1') !== '0',
      });
      const timer = await getTaskTimerSnapshot(user, result.tasks.map((task) => task.id));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ...result,
        ...timer,
        syncedAt: new Date().toISOString(),
      });
    }

    if (req.method === 'GET' && taskAction === 'flowlu-task-timer-history') {
      const taskId = Number(req.query.taskId || 0) || undefined;
      const sessions = await listTaskTimerHistory(user, taskId, Number(req.query.limit || 500));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ sessions });
    }

    if (req.method === 'POST' && taskAction === 'flowlu-task-board-create') {
      const body = req.body || {};
      const result = await createFlowluTask({
        name: String(body.name || ''),
        responsibleId: Number(body.responsibleId || 0),
        createdBy: Number(body.flowluCreatedBy || body.responsibleId || 0),
        deadline: body.deadline ? String(body.deadline) : undefined,
        description: body.description ? String(body.description) : undefined,
        priority: Number(body.priority || 2),
        timeEstimate: Math.max(0, Number(body.timeEstimateSeconds || 0)),
        crmCompanyId: Number(body.crmCompanyId || 0) || undefined,
      });
      return res.status(201).json({ ok: true, taskId: result.id });
    }

    if (req.method === 'PATCH' && taskAction === 'flowlu-task-board-update') {
      const body = req.body || {};
      const statusRaw = body.status === undefined ? undefined : Number(body.status);
      if (statusRaw !== undefined && ![1, 3, 4, 5].includes(statusRaw)) {
        return res.status(400).json({ error: 'Choose a valid Flowlu task status.' });
      }

      const result = await updateFlowluTask({
        id: Number(body.id || 0),
        name: body.name === undefined ? undefined : String(body.name),
        responsibleId: body.responsibleId === undefined ? undefined : Number(body.responsibleId || 0),
        deadline: body.deadline === undefined ? undefined : String(body.deadline || ''),
        description: body.description === undefined ? undefined : String(body.description || ''),
        priority: body.priority === undefined ? undefined : Number(body.priority),
        timeEstimate: body.timeEstimateSeconds === undefined
          ? undefined
          : Math.max(0, Number(body.timeEstimateSeconds || 0)),
        status: statusRaw as FlowluTaskStatus | undefined,
      });
      return res.status(200).json({ ok: true, task: result });
    }

    if (req.method === 'POST' && taskAction === 'flowlu-task-timer') {
      const body = req.body || {};
      const timerAction = String(body.timerAction || '').trim().toLowerCase();
      const taskId = Number(body.taskId || 0);

      if (timerAction === 'start') {
        const result = await startTaskTimer(user, {
          taskId,
          taskName: String(body.taskName || ''),
        });
        return res.status(200).json({ ok: true, ...result });
      }

      if (['pause', 'stop', 'complete'].includes(timerAction)) {
        const result = await endTaskTimer(user, {
          taskId,
          action: timerAction as 'pause' | 'stop' | 'complete',
          note: body.note ? String(body.note) : undefined,
        });
        return res.status(200).json({ ok: true, ...result });
      }

      return res.status(400).json({ error: 'Unsupported timer action.' });
    }

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
    const message = error instanceof Error ? error.message : 'Unable to manage campaigns or tasks.';
    const setupMissing = /timer storage is not set up|005_flowlu_task_timer_sessions/i.test(message);
    return res.status(setupMissing ? 503 : 500).json({ error: message });
  }
}
