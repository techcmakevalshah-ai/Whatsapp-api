import { flowluGet, flowluPost } from './flowluContacts.js';

export type FlowluTaskStatus = 1 | 3 | 4 | 5;

export type FlowluTaskUser = {
  id: number;
  name: string;
  active: boolean;
};

export type FlowluTaskRecord = {
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

function activeFlag(value: unknown) {
  return ![0, '0', false, 'false', 'inactive'].includes(
    typeof value === 'string' ? value.toLowerCase() : value as any,
  );
}

function normalizeTaskStatus(value: unknown): FlowluTaskStatus {
  const status = Number(value || 1);
  if (status === 3 || status === 4 || status === 5) return status;
  return 1;
}

function normalizePriority(value: unknown): 1 | 2 | 3 {
  const priority = Number(value || 2);
  if (priority === 1 || priority === 3) return priority;
  return 2;
}

function flowluDate(value: unknown) {
  return String(value || '').trim();
}

function isPastDeadline(value: string, status: FlowluTaskStatus) {
  if (!value || status === 5) return false;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

async function fetchUsers(): Promise<FlowluTaskUser[]> {
  const data = await flowluGet('core/user/list', { page: 1, limit: 200 });
  const items: any[] = Array.isArray(data?.response?.items) ? data.response.items : [];
  return items
    .map((row: any): FlowluTaskUser => ({
      id: Number(row?.id || 0),
      name:
        String(row?.name || '').trim() ||
        [row?.first_name, row?.last_name]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(' ') ||
        String(row?.email || '').trim() ||
        `User #${Number(row?.id || 0)}`,
      active: activeFlag(row?.active ?? row?.is_active ?? 1),
    }))
    .filter((row: FlowluTaskUser) => row.id > 0 && Boolean(row.name));
}

function mapTask(row: any, users: Map<number, string>): FlowluTaskRecord | null {
  const id = Number(row?.id || 0);
  const name = String(row?.name || '').trim();
  if (!id || !name) return null;

  const status = normalizeTaskStatus(row?.status ?? row?.stage);
  const stage = normalizeTaskStatus(row?.stage ?? row?.status);
  const responsibleId = Number(row?.responsible_id || 0) || null;
  const deadline = flowluDate(row?.deadline);

  return {
    id,
    name,
    description: String(row?.description || '').trim(),
    status,
    stage,
    priority: normalizePriority(row?.priority),
    responsibleId,
    responsibleName: responsibleId ? users.get(responsibleId) || `User #${responsibleId}` : 'Unassigned',
    createdBy: Number(row?.created_by || 0) || null,
    deadline,
    planStartDate: flowluDate(row?.plan_start_date),
    planEndDate: flowluDate(row?.plan_end_date),
    created: flowluDate(row?.created),
    changed: flowluDate(row?.changed),
    closedDate: flowluDate(row?.closed_date),
    timeEstimate: Math.max(0, Number(row?.time_estimate || 0)),
    timeSpent: Math.max(0, Number(row?.time_spent || 0)),
    progress: Number(row?.progress || 0),
    crmCompanyId: Number(row?.crm_company_id || 0) || null,
    module: String(row?.module || '').trim(),
    model: String(row?.model || '').trim(),
    modelId: Number(row?.model_id || 0) || null,
    overdue: isPastDeadline(deadline, status),
  };
}

export async function fetchFlowluTasks(input: {
  search?: string;
  responsibleId?: number;
  status?: number;
  includeCompleted?: boolean;
  maxPages?: number;
} = {}) {
  const users: FlowluTaskUser[] = await fetchUsers();
  const userMap = new Map<number, string>(users.map((user: FlowluTaskUser) => [user.id, user.name]));
  const tasks: FlowluTaskRecord[] = [];
  const maxPages = Math.min(15, Math.max(1, Number(input.maxPages || 8)));
  let seen = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const query: Record<string, string | number> = {
      page,
      limit: 200,
      'filter[archive_status]': 0,
      'filter[type]': 0,
    };
    if (input.search?.trim()) query.search = input.search.trim();
    if (input.responsibleId) query['filter[responsible_id]'] = input.responsibleId;
    if (input.status) query['filter[status]'] = input.status;

    const data = await flowluGet('task/task/list', query);
    const response = data?.response || {};
    const rows: any[] = Array.isArray(response?.items) ? response.items : [];
    if (!rows.length) break;

    for (const row of rows) {
      if (Number(row?.archive_status || 0) === 10) continue;
      if (Number(row?.type || 0) !== 0) continue;
      if (Number(row?.is_repeat || 0) === 1) continue;

      const task = mapTask(row, userMap);
      if (!task) continue;
      if (!input.includeCompleted && task.status === 5) continue;
      tasks.push(task);
    }

    seen += rows.length;
    const total = Number(response?.total || 0);
    if ((total > 0 && seen >= total) || rows.length < 200) break;
  }

  tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status - b.status;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.id - a.id;
  });

  return { tasks, users: users.filter((user: FlowluTaskUser) => user.active) };
}

export async function fetchFlowluTaskById(id: number) {
  if (!Number.isFinite(id) || id <= 0) throw new Error('Flowlu task id is required.');
  const [data, users] = await Promise.all([
    flowluGet(`task/task/get/${id}`),
    fetchUsers(),
  ]);
  const userMap = new Map<number, string>(users.map((user: FlowluTaskUser) => [user.id, user.name]));
  const task = mapTask(data?.response || {}, userMap);
  if (!task) throw new Error('Flowlu task was not found.');
  return task;
}

export async function createFlowluTask(input: {
  name: string;
  responsibleId: number;
  createdBy?: number;
  deadline?: string;
  description?: string;
  priority?: number;
  timeEstimate?: number;
  crmCompanyId?: number;
}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Task name is required.');
  if (!Number.isFinite(input.responsibleId) || input.responsibleId <= 0) {
    throw new Error('Choose a responsible Flowlu user.');
  }

  const deadline = String(input.deadline || '').trim();
  const parsedDeadline = deadline ? new Date(deadline) : null;
  if (parsedDeadline && Number.isNaN(parsedDeadline.getTime())) {
    throw new Error('Enter a valid task deadline.');
  }

  const result = await flowluPost('task/task/create', {
    name,
    responsible_id: input.responsibleId,
    created_by: Number(input.createdBy || input.responsibleId),
    deadline: parsedDeadline
      ? parsedDeadline.toISOString().slice(0, 19).replace('T', ' ')
      : undefined,
    description: String(input.description || '').trim() || undefined,
    priority: normalizePriority(input.priority),
    time_estimate: Math.max(0, Number(input.timeEstimate || 0)) || undefined,
    crm_company_id: Number(input.crmCompanyId || 0) || undefined,
    status: 1,
    stage: 1,
    archive_status: 0,
    is_repeat: 0,
    type: 0,
  });

  const id = Number(result?.response?.id || 0);
  if (!id) throw new Error('Flowlu task could not be created.');
  return { id };
}

export async function updateFlowluTask(input: {
  id: number;
  name?: string;
  responsibleId?: number | null;
  deadline?: string | null;
  description?: string;
  priority?: number;
  timeEstimate?: number;
  status?: FlowluTaskStatus;
  timeSpent?: number;
}) {
  if (!Number.isFinite(input.id) || input.id <= 0) throw new Error('Flowlu task id is required.');

  const body: Record<string, string | number | undefined> = {};
  if (input.name !== undefined) body.name = String(input.name).trim();
  if (input.responsibleId !== undefined) body.responsible_id = Number(input.responsibleId || 0) || undefined;
  if (input.description !== undefined) body.description = String(input.description || '').trim();
  if (input.priority !== undefined) body.priority = normalizePriority(input.priority);
  if (input.timeEstimate !== undefined) body.time_estimate = Math.max(0, Number(input.timeEstimate || 0));
  if (input.timeSpent !== undefined) body.time_spent = Math.max(0, Math.round(Number(input.timeSpent || 0)));

  if (input.deadline !== undefined) {
    const deadline = String(input.deadline || '').trim();
    if (deadline) {
      const parsed = new Date(deadline);
      if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid task deadline.');
      body.deadline = parsed.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  if (input.status !== undefined) {
    const status = normalizeTaskStatus(input.status);
    body.status = status;
    body.stage = status;
    body.progress = status === 5 ? 5 : status === 4 ? 4 : status === 3 ? 2 : 1;
  }

  const data = await flowluPost(`task/task/update/${input.id}`, body);
  return data?.response || { id: input.id };
}
