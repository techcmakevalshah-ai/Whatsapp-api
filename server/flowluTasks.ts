import { flowluGet, flowluPost } from './flowluContacts.js';

export type FlowluTaskStatus = 1 | 3 | 4 | 5;

export type FlowluTaskUser = {
  id: number;
  name: string;
  active: boolean;
};

export type FlowluTaskWorkflow = {
  id: number;
  name: string;
  active: boolean;
  sort: number;
};

export type FlowluTaskStage = {
  id: number;
  workflowId: number;
  name: string;
  systemStatus: FlowluTaskStatus;
  active: boolean;
  sort: number;
};

export type FlowluTaskRecord = {
  id: number;
  name: string;
  description: string;
  status: FlowluTaskStatus;
  stage: FlowluTaskStatus;
  workflowId: number | null;
  workflowStageId: number | null;
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

function sortValue(row: any, fallback: number) {
  const value = Number(
    row?.sort ?? row?.sorting ?? row?.position ?? row?.order ?? row?.sequence ?? fallback,
  );
  return Number.isFinite(value) ? value : fallback;
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

async function fetchTaskWorkflowMeta() {
  const workflowData = await flowluGet('task/workflows/list', { page: 1, limit: 200 });
  const workflowRows: any[] = Array.isArray(workflowData?.response?.items)
    ? workflowData.response.items
    : [];

  const workflows: FlowluTaskWorkflow[] = workflowRows
    .map((row: any): FlowluTaskWorkflow => ({
      id: Number(row?.id || 0),
      name: String(row?.name || row?.title || '').trim(),
      active: activeFlag(row?.active ?? row?.is_active ?? 1),
      sort: sortValue(row, Number(row?.id || 0)),
    }))
    .filter((row) => row.id > 0 && Boolean(row.name) && row.active)
    .sort((a, b) => a.sort - b.sort || a.id - b.id);

  const stageData = await flowluGet('task/stages/list', { page: 1, limit: 500 });
  const stageRows: any[] = Array.isArray(stageData?.response?.items)
    ? stageData.response.items
    : [];

  const stages: FlowluTaskStage[] = stageRows
    .map((row: any): FlowluTaskStage => ({
      id: Number(row?.id || 0),
      workflowId: Number(row?.workflow_id || row?.task_workflow_id || 0),
      name: String(row?.name || row?.title || '').trim(),
      systemStatus: normalizeTaskStatus(
        row?.status ?? row?.system_status ?? row?.status_id ?? row?.type,
      ),
      active: activeFlag(row?.active ?? row?.is_active ?? 1),
      sort: sortValue(row, Number(row?.id || 0)),
    }))
    .filter((row) => row.id > 0 && row.workflowId > 0 && Boolean(row.name) && row.active)
    .sort((a, b) => a.workflowId - b.workflowId || a.sort - b.sort || a.id - b.id);

  return { workflows, stages };
}

function mapTask(
  row: any,
  users: Map<number, string>,
  stageMap: Map<number, FlowluTaskStage>,
): FlowluTaskRecord | null {
  const id = Number(row?.id || 0);
  const name = String(row?.name || '').trim();
  if (!id || !name) return null;

  const workflowId = Number(row?.workflow_id || 0) || null;
  const workflowStageId = Number(row?.workflow_stage_id || 0) || null;
  const workflowStage = workflowStageId ? stageMap.get(workflowStageId) : undefined;
  const status = normalizeTaskStatus(
    row?.status ?? row?.stage ?? workflowStage?.systemStatus,
  );
  const responsibleId = Number(row?.responsible_id || 0) || null;
  const deadline = flowluDate(row?.deadline);

  return {
    id,
    name,
    description: String(row?.description || '').trim(),
    status,
    stage: status,
    workflowId,
    workflowStageId,
    priority: normalizePriority(row?.priority),
    responsibleId,
    responsibleName: responsibleId ? users.get(responsibleId) || `User #${responsibleId}` : 'Unassigned',
    createdBy: Number(row?.created_by || 0) || null,
    deadline,
    planStartDate: flowluDate(row?.plan_start_date),
    planEndDate: flowluDate(row?.plan_end_date),
    created: flowluDate(row?.created ?? row?.created_date),
    changed: flowluDate(row?.changed ?? row?.updated_date),
    closedDate: flowluDate(row?.closed_date),
    timeEstimate: Math.max(0, Number(row?.time_estimate || 0)),
    timeSpent: Math.max(0, Number(row?.time_spent || 0)),
    progress: Number(row?.progress || 0),
    crmCompanyId: Number(row?.crm_company_id || row?.crm_account_id || 0) || null,
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
  workflowId?: number;
  workflowStageId?: number;
  includeCompleted?: boolean;
  maxPages?: number;
} = {}) {
  const users = await fetchUsers();
  let workflowMeta: { workflows: FlowluTaskWorkflow[]; stages: FlowluTaskStage[] } = {
    workflows: [],
    stages: [],
  };

  try {
    workflowMeta = await fetchTaskWorkflowMeta();
  } catch {
    // A restricted Flowlu API key can still use the Common Kanban task view.
  }

  const userMap = new Map<number, string>(users.map((user) => [user.id, user.name]));
  const stageMap = new Map<number, FlowluTaskStage>(workflowMeta.stages.map((stage) => [stage.id, stage]));
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
    if (input.workflowId) query['filter[workflow_id]'] = input.workflowId;
    if (input.workflowStageId) query['filter[workflow_stage_id]'] = input.workflowStageId;

    const data = await flowluGet('task/tasks/list', query);
    const response = data?.response || {};
    const rows: any[] = Array.isArray(response?.items) ? response.items : [];
    if (!rows.length) break;

    for (const row of rows) {
      if (Number(row?.archive_status || 0) === 10) continue;
      if (Number(row?.type || 0) !== 0) continue;
      if (Number(row?.is_repeat || 0) === 1) continue;

      const task = mapTask(row, userMap, stageMap);
      if (!task) continue;
      if (input.workflowId && task.workflowId !== input.workflowId) continue;
      if (input.workflowStageId && task.workflowStageId !== input.workflowStageId) continue;
      if (!input.includeCompleted && task.status === 5) continue;
      tasks.push(task);
    }

    seen += rows.length;
    const total = Number(response?.total || 0);
    if ((total > 0 && seen >= total) || rows.length < 200) break;
  }

  tasks.sort((a, b) => {
    const aStage = a.workflowStageId ? stageMap.get(a.workflowStageId)?.sort ?? a.status : a.status;
    const bStage = b.workflowStageId ? stageMap.get(b.workflowStageId)?.sort ?? b.status : b.status;
    if (aStage !== bStage) return aStage - bStage;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.id - a.id;
  });

  return {
    tasks,
    users: users.filter((user) => user.active),
    workflows: workflowMeta.workflows,
    stages: workflowMeta.stages,
  };
}

export async function fetchFlowluTaskById(id: number) {
  if (!Number.isFinite(id) || id <= 0) throw new Error('Flowlu task id is required.');
  const users = await fetchUsers();
  let stages: FlowluTaskStage[] = [];
  try {
    stages = (await fetchTaskWorkflowMeta()).stages;
  } catch {
    stages = [];
  }

  const data = await flowluGet(`task/tasks/get/${id}`);
  const userMap = new Map<number, string>(users.map((user) => [user.id, user.name]));
  const stageMap = new Map<number, FlowluTaskStage>(stages.map((stage) => [stage.id, stage]));
  const task = mapTask(data?.response || {}, userMap, stageMap);
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
  workflowId?: number;
  workflowStageId?: number;
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

  const result = await flowluPost('task/tasks/create', {
    name,
    responsible_id: input.responsibleId,
    created_by: Number(input.createdBy || input.responsibleId),
    deadline: parsedDeadline
      ? parsedDeadline.toISOString().slice(0, 19).replace('T', ' ')
      : undefined,
    description: String(input.description || '').trim() || undefined,
    priority: normalizePriority(input.priority),
    time_estimate: Math.max(0, Number(input.timeEstimate || 0)) || undefined,
    crm_account_id: Number(input.crmCompanyId || 0) || undefined,
    workflow_id: Number(input.workflowId || 0) || undefined,
    workflow_stage_id: Number(input.workflowStageId || 0) || undefined,
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
  workflowId?: number | null;
  workflowStageId?: number | null;
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
  if (input.workflowId !== undefined) body.workflow_id = Number(input.workflowId || 0) || undefined;
  if (input.workflowStageId !== undefined) body.workflow_stage_id = Number(input.workflowStageId || 0) || undefined;

  if (input.deadline !== undefined) {
    const deadline = String(input.deadline || '').trim();
    if (deadline) {
      const parsed = new Date(deadline);
      if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid task deadline.');
      body.deadline = parsed.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  if (input.status !== undefined && input.workflowStageId === undefined) {
    const status = normalizeTaskStatus(input.status);
    body.status = status;
  }

  const data = await flowluPost(`task/tasks/update/${input.id}`, body);
  return data?.response || { id: input.id };
}
