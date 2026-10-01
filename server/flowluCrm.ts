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
