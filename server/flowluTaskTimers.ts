import type { StaffUser } from './auth.js';
import { supabaseAdmin } from './supabaseAdmin.js';
import { fetchFlowluTaskById, updateFlowluTask } from './flowluTasks.js';

export type FlowluTaskTimerSession = {
  id: string;
  taskId: number;
  taskName: string;
  staffKey: string;
  staffName: string;
  staffEmail: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  endAction: 'pause' | 'stop' | 'complete' | null;
  note: string;
};

function timerTableMissing(error: any) {
  const message = String(error?.message || error || '');
  return error?.code === '42P01' || /flowlu_task_timer_sessions|relation .* does not exist/i.test(message);
}

function timerSetupError() {
  return new Error('Task timer storage is not set up yet. Run migration 005_flowlu_task_timer_sessions.sql in Supabase.');
}

function mapSession(row: any): FlowluTaskTimerSession {
  return {
    id: String(row?.id || ''),
    taskId: Number(row?.flowlu_task_id || 0),
    taskName: String(row?.flowlu_task_name || '').trim() || `Task #${Number(row?.flowlu_task_id || 0)}`,
    staffKey: String(row?.staff_key || ''),
    staffName: String(row?.staff_name || '').trim() || 'Team member',
    staffEmail: String(row?.staff_email || '').trim(),
    startedAt: String(row?.started_at || ''),
    endedAt: row?.ended_at ? String(row.ended_at) : null,
    durationSeconds: Math.max(0, Number(row?.duration_seconds || 0)),
    endAction: ['pause', 'stop', 'complete'].includes(String(row?.end_action || ''))
      ? String(row.end_action) as 'pause' | 'stop' | 'complete'
      : null,
    note: String(row?.note || '').trim(),
  };
}

function staffLabel(user: StaffUser) {
  return String(user.fullName || user.email || 'Team member').trim() || 'Team member';
}

export async function getTaskTimerSnapshot(user: StaffUser, taskIds: number[] = []) {
  const sb = supabaseAdmin();
  let query = sb
    .from('flowlu_task_timer_sessions')
    .select('id, flowlu_task_id, flowlu_task_name, staff_key, staff_name, staff_email, started_at, ended_at, duration_seconds, end_action, note')
    .order('started_at', { ascending: false })
    .limit(2000);

  if (taskIds.length) query = query.in('flowlu_task_id', taskIds.slice(0, 1000));

  const { data, error } = await query;
  if (error) {
    if (timerTableMissing(error)) {
      return {
        timerReady: false,
        sessions: [] as FlowluTaskTimerSession[],
        totalsByTask: {} as Record<string, number>,
        runningByTask: {} as Record<string, FlowluTaskTimerSession>,
        currentTimer: null as FlowluTaskTimerSession | null,
      };
    }
    throw error;
  }

  const sessions = (data || []).map(mapSession);
  const totalsByTask: Record<string, number> = {};
  const runningByTask: Record<string, FlowluTaskTimerSession> = {};
  let currentTimer: FlowluTaskTimerSession | null = null;

  for (const session of sessions) {
    const key = String(session.taskId);
    totalsByTask[key] = (totalsByTask[key] || 0) + session.durationSeconds;
    if (!session.endedAt && !runningByTask[key]) runningByTask[key] = session;
    if (!session.endedAt && session.staffKey === user.id && !currentTimer) currentTimer = session;
  }

  return { timerReady: true, sessions, totalsByTask, runningByTask, currentTimer };
}

export async function listTaskTimerHistory(user: StaffUser, taskId?: number, limit = 500) {
  const sb = supabaseAdmin();
  let query = sb
    .from('flowlu_task_timer_sessions')
    .select('id, flowlu_task_id, flowlu_task_name, staff_key, staff_name, staff_email, started_at, ended_at, duration_seconds, end_action, note')
    .order('started_at', { ascending: false })
    .limit(Math.min(1000, Math.max(1, limit)));

  if (taskId && Number.isFinite(taskId)) query = query.eq('flowlu_task_id', taskId);
  if (user.role !== 'admin') query = query.eq('staff_key', user.id);

  const { data, error } = await query;
  if (error) {
    if (timerTableMissing(error)) throw timerSetupError();
    throw error;
  }

  return (data || []).map(mapSession);
}

async function currentOpenSession(user: StaffUser) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('flowlu_task_timer_sessions')
    .select('id, flowlu_task_id, flowlu_task_name, staff_key, staff_name, staff_email, started_at, ended_at, duration_seconds, end_action, note')
    .eq('staff_key', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (timerTableMissing(error)) throw timerSetupError();
    throw error;
  }
  return data ? mapSession(data) : null;
}

export async function startTaskTimer(user: StaffUser, input: { taskId: number; taskName?: string }) {
  if (!Number.isFinite(input.taskId) || input.taskId <= 0) throw new Error('Flowlu task id is required.');

  const existing = await currentOpenSession(user);
  if (existing) {
    if (existing.taskId === input.taskId) return { session: existing, alreadyRunning: true };
    throw new Error(`A timer is already running for “${existing.taskName}”. Pause or stop it before starting another task.`);
  }

  const task = await fetchFlowluTaskById(input.taskId);
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('flowlu_task_timer_sessions')
    .insert({
      flowlu_task_id: input.taskId,
      flowlu_task_name: String(input.taskName || task.name || '').trim() || `Task #${input.taskId}`,
      staff_key: user.id,
      staff_name: staffLabel(user),
      staff_email: String(user.email || '').trim(),
      started_at: now,
      duration_seconds: 0,
    })
    .select('id, flowlu_task_id, flowlu_task_name, staff_key, staff_name, staff_email, started_at, ended_at, duration_seconds, end_action, note')
    .single();

  if (error) {
    if (timerTableMissing(error)) throw timerSetupError();
    throw error;
  }

  if (task.status === 1) {
    try {
      await updateFlowluTask({ id: task.id, status: 3 });
    } catch {
      // The timer is still valid even if the Flowlu status could not be advanced.
    }
  }

  return { session: mapSession(data), alreadyRunning: false };
}

export async function endTaskTimer(
  user: StaffUser,
  input: { taskId: number; action: 'pause' | 'stop' | 'complete'; note?: string },
) {
  if (!Number.isFinite(input.taskId) || input.taskId <= 0) throw new Error('Flowlu task id is required.');

  const session = await currentOpenSession(user);
  if (!session || session.taskId !== input.taskId) {
    throw new Error('There is no running timer for this task.');
  }

  const endedAt = new Date();
  const startedAt = new Date(session.startedAt);
  const durationSeconds = Math.max(
    1,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  );

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('flowlu_task_timer_sessions')
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      end_action: input.action,
      note: String(input.note || '').trim() || null,
    })
    .eq('id', session.id)
    .is('ended_at', null)
    .select('id, flowlu_task_id, flowlu_task_name, staff_key, staff_name, staff_email, started_at, ended_at, duration_seconds, end_action, note')
    .single();

  if (error) throw error;

  let flowluSyncWarning = '';
  try {
    const task = await fetchFlowluTaskById(input.taskId);
    await updateFlowluTask({
      id: task.id,
      timeSpent: Math.max(0, task.timeSpent) + durationSeconds,
      status: input.action === 'complete' ? 5 : undefined,
    });
  } catch (error) {
    flowluSyncWarning = error instanceof Error ? error.message : 'Unable to sync the elapsed time to Flowlu.';
  }

  return { session: mapSession(data), flowluSyncWarning };
}
