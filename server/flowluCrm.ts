import { flowluGet, flowluPost } from './flowluContacts.js';

export type FlowluOption = {
  id: number;
  name: string;
  active: boolean;
  pipelineId?: number | null;
};

function activeFlag(value: unknown) {
  return ![0, '0', false, 'false', 'inactive'].includes(
    typeof value === 'string' ? value.toLowerCase() : value as any,
  );
}

async function list(path: string, limit = 200) {
  const data = await flowluGet(path, { page: 1, limit });
  return Array.isArray(data?.response?.items) ? data.response.items : [];
}

export async function getFlowluSalesMeta() {
  const [pipelineRows, stageRows, sourceRows, userRows] = await Promise.all([
    list('crm/pipeline/list'),
    list('crm/pipeline_stage/list'),
    list('crm/source/list'),
    list('core/user/list'),
  ]);

  const pipelines: FlowluOption[] = pipelineRows.map((row: any) => ({
    id: Number(row?.id || 0),
    name: String(row?.name || '').trim(),
    active: activeFlag(row?.active),
  })).filter((row: FlowluOption) => row.id > 0 && row.name && row.active);

  const stages: FlowluOption[] = stageRows.map((row: any) => ({
    id: Number(row?.id || 0),
    name: String(row?.name || '').trim(),
    active: activeFlag(row?.active),
    pipelineId: Number(row?.pipeline_id || 0) || null,
  })).filter((row: FlowluOption) => row.id > 0 && row.name && row.active);

  const sources: FlowluOption[] = sourceRows.map((row: any) => ({
    id: Number(row?.id || 0),
    name: String(row?.name || '').trim(),
    active: activeFlag(row?.active),
  })).filter((row: FlowluOption) => row.id > 0 && row.name && row.active);

  const users: FlowluOption[] = userRows.map((row: any) => ({
    id: Number(row?.id || 0),
    name:
      String(row?.name || '').trim() ||
      [row?.first_name, row?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ') ||
      String(row?.email || '').trim(),
    active: activeFlag(row?.active ?? row?.is_active ?? 1),
  })).filter((row: FlowluOption) => row.id > 0 && row.name && row.active);

  return { pipelines, stages, sources, users };
}

export async function createFlowluOpportunity(input: {
  accountId: number;
  name: string;
  budget?: number;
  pipelineId: number;
  stageId?: number;
  sourceId?: number;
  assigneeId?: number;
}) {
  if (!Number.isFinite(input.accountId) || input.accountId <= 0) throw new Error('Flowlu contact id is required.');
  if (!String(input.name || '').trim()) throw new Error('Opportunity name is required.');
  if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) throw new Error('Choose a Flowlu pipeline.');

  const created = await flowluPost('crm/lead/create', {
    name: String(input.name).trim(),
    budget: Number.isFinite(input.budget) ? input.budget : undefined,
    pipeline_id: input.pipelineId,
    pipeline_stage_id: input.stageId,
    source_id: input.sourceId,
    assignee_id: input.assigneeId,
    active: 1,
  });

  const leadId = Number(created?.response?.id || 0);
  if (!leadId) throw new Error('Flowlu opportunity could not be created.');

  try {
    await flowluPost('crm/lead_accounts/create', {
      lead_id: leadId,
      account_id: input.accountId,
      account_type: 2,
    });
  } catch (error) {
    throw new Error(
      'Opportunity #' + leadId + ' was created, but Flowlu could not link it to this contact. ' +
      (error instanceof Error ? error.message : String(error)),
    );
  }

  return { id: leadId };
}


function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function createFlowluFollowupTask(input: {
  accountId: number;
  name: string;
  responsibleId: number;
  deadline?: string;
  description?: string;
}) {
  if (!Number.isFinite(input.accountId) || input.accountId <= 0) {
    throw new Error('Flowlu contact id is required.');
  }
  if (!String(input.name || '').trim()) {
    throw new Error('Task name is required.');
  }
  if (!Number.isFinite(input.responsibleId) || input.responsibleId <= 0) {
    throw new Error('Choose a responsible Flowlu user.');
  }

  const deadline = String(input.deadline || '').trim();
  const parsedDeadline = deadline ? new Date(deadline) : null;
  if (parsedDeadline && Number.isNaN(parsedDeadline.getTime())) {
    throw new Error('Enter a valid follow-up date and time.');
  }

  const data = await flowluPost('task/task/create', {
    name: String(input.name).trim(),
    responsible_id: input.responsibleId,
    created_by: input.responsibleId,
    crm_company_id: input.accountId,
    deadline: parsedDeadline ? parsedDeadline.toISOString().replace('T', ' ').replace('Z', '') : undefined,
    description: String(input.description || '').trim() || undefined,
    archive_status: 0,
    is_repeat: 0,
  });

  const taskId = Number(data?.response?.id || 0);
  if (!taskId) throw new Error('Flowlu follow-up task could not be created.');
  return { id: taskId };
}

export async function createFlowluContactNote(input: {
  accountId: number;
  text: string;
}) {
  if (!Number.isFinite(input.accountId) || input.accountId <= 0) {
    throw new Error('Flowlu contact id is required.');
  }

  const text = String(input.text || '').trim();
  if (!text) throw new Error('Enter a note.');

  const safeText = escapeHtml(text).replace(/\n/g, '<br>');
  const data = await flowluPost('crm/account/' + input.accountId + '/comments/create', {
    text: '<p>' + safeText + '</p>',
  });

  return { id: Number(data?.response?.id || 0) || null };
}
