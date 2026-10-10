import { supabase } from './supabase';

export type FlowluTaskStatus = 1 | 3 | 4 | 5;

export type FlowluTaskUser = {
  id: number;
  name: string;
  active: boolean;
};

export type FlowluTask = {
  id: number;
  name: string;
  description: string;
  status: FlowluTaskStatus;
  stage: FlowluTaskStatus;
  priority: 1 | 2 | 3;
  responsibleId: number | null;
  responsibleName: string;
  createdBy: number | null;
  deadline: string;
  planStartDate: string;
  planEndDate: string;
  created: string;
  changed: string;
  closedDate: string;
  timeEstimate: number;
  timeSpent: number;
  progress: number;
  crmCompanyId: number | null;
  module: string;
  model: string;
  modelId: number | null;
  overdue: boolean;
};

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

export type FlowluTaskBoardResponse = {
  tasks: FlowluTask[];
  users: FlowluTaskUser[];
  timerReady: boolean;
  sessions: FlowluTaskTimerSession[];
  totalsByTask: Record<string, number>;
  runningByTask: Record<string, FlowluTaskTimerSession>;
  currentTimer: FlowluTaskTimerSession | null;
  syncedAt: string;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

export function getFlowluTasks(filters: {
  search?: string;
  responsibleId?: number;
  status?: FlowluTaskStatus;
  includeCompleted?: boolean;
} = {}): Promise<FlowluTaskBoardResponse> {
  const params = new URLSearchParams({ action: 'flowlu-tasks' });
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.responsibleId) params.set('responsibleId', String(filters.responsibleId));
  if (filters.status) params.set('status', String(filters.status));
  params.set('includeCompleted', filters.includeCompleted === false ? '0' : '1');
  return json(`/api/campaigns?${params.toString()}`);
}

export function createFlowluBoardTask(payload: {
  name: string;
  responsibleId: number;
  deadline?: string;
  description?: string;
  priority?: 1 | 2 | 3;
  timeEstimateSeconds?: number;
  crmCompanyId?: number;
}): Promise<{ ok: true; taskId: number }> {
  return json('/api/campaigns?action=flowlu-task-board-create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateFlowluBoardTask(payload: {
  id: number;
  name?: string;
  responsibleId?: number;
  deadline?: string;
  description?: string;
  priority?: 1 | 2 | 3;
  timeEstimateSeconds?: number;
  status?: FlowluTaskStatus;
}): Promise<{ ok: true; task: unknown }> {
  return json('/api/campaigns?action=flowlu-task-board-update', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getFlowluTaskTimerHistory(taskId?: number): Promise<{
  sessions: FlowluTaskTimerSession[];
}> {
  const params = new URLSearchParams({ action: 'flowlu-task-timer-history' });
  if (taskId) params.set('taskId', String(taskId));
  return json(`/api/campaigns?${params.toString()}`);
}

export function runFlowluTaskTimer(payload: {
  taskId: number;
  taskName?: string;
  timerAction: 'start' | 'pause' | 'stop' | 'complete';
  note?: string;
}): Promise<{
  ok: true;
  session: FlowluTaskTimerSession;
  alreadyRunning?: boolean;
  flowluSyncWarning?: string;
}> {
  return json('/api/campaigns?action=flowlu-task-timer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
