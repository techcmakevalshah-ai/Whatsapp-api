import { flowluGet, flowluPost } from './flowluContacts.js';

export type FlowluOpportunityControl = {
  id: number;
  name: string;
  active: number;
  pipelineId: number | null;
  stageId: number | null;
  sourceId: number | null;
  assigneeId: number | null;
  budget: number;
  description: string;
  startDate: string;
  deadline: string;
  closingDate: string;
  closingStatusId: number | null;
  closingComment: string;
};

export type FlowluLossReason = {
  id: number;
  name: string;
  active: boolean;
};

function activeFlag(value: unknown) {
  return ![0, '0', false, 'false', 'inactive'].includes(
    typeof value === 'string' ? value.toLowerCase() : value as any,
  );
}

function mapOpportunity(row: any): FlowluOpportunityControl | null {
  const id = Number(row?.id || 0);
  const name = String(row?.name || '').trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    active: Number(row?.active || 1),
    pipelineId: Number(row?.pipeline_id || 0) || null,
    stageId: Number(row?.pipeline_stage_id || 0) || null,
    sourceId: Number(row?.source_id || 0) || null,
    assigneeId: Number(row?.assignee_id || 0) || null,
    budget: Number(row?.budget || 0),
    description: String(row?.description || '').trim(),
    startDate: String(row?.start_date || '').trim(),
    deadline: String(row?.deadline || '').trim(),
    closingDate: String(row?.closing_date || '').trim(),
    closingStatusId: Number(row?.closing_status_id || 0) || null,
    closingComment: String(row?.closing_comment || '').trim(),
  };
}

export async function fetchFlowluLossReasons(): Promise<FlowluLossReason[]> {
  const data = await flowluGet('crm/loss_reason/list', { page: 1, limit: 200 });
  const items = Array.isArray(data?.response?.items) ? data.response.items : [];
  return items
    .map((row: any) => ({
      id: Number(row?.id || 0),
      name: String(row?.name || '').trim(),
      active: activeFlag(row?.active),
    }))
    .filter((row: FlowluLossReason) => row.id > 0 && row.name && row.active)
    .sort((a: FlowluLossReason, b: FlowluLossReason) => a.name.localeCompare(b.name));
}

export async function fetchFlowluOpportunitiesForContact(accountId: number) {
  if (!Number.isFinite(accountId) || accountId <= 0) {
    throw new Error('Flowlu contact id is required.');
  }

  const relationData = await flowluGet('crm/lead_accounts/list', {
    page: 1,
    limit: 200,
    'filter[account_id]': accountId,
    'filter[account_type]': 2,
  });
  const relations = Array.isArray(relationData?.response?.items) ? relationData.response.items : [];
  const leadIds = [...new Set(relations.map((row: any) => Number(row?.lead_id || 0)).filter((id: number) => id > 0))];

  const opportunities: FlowluOpportunityControl[] = [];
  for (const leadId of leadIds) {
    try {
      const data = await flowluGet('crm/lead/get/' + leadId);
      const mapped = mapOpportunity(data?.response);
      if (mapped) opportunities.push(mapped);
    } catch {
      // Skip stale relationship rows without failing the whole contact drawer.
    }
  }

  opportunities.sort((a, b) => {
    if (a.active === 1 && b.active !== 1) return -1;
    if (b.active === 1 && a.active !== 1) return 1;
    return b.id - a.id;
  });

  return {
    opportunities,
    lossReasons: await fetchFlowluLossReasons(),
  };
}

function todayDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function updateFlowluOpportunity(input: {
  id: number;
  name?: string;
  budget?: number;
  pipelineId?: number;
  stageId?: number;
  sourceId?: number | null;
  assigneeId?: number | null;
  description?: string;
  deadline?: string;
  action?: 'save' | 'won' | 'lost' | 'reopen';
  lossReasonId?: number;
  closingComment?: string;
}) {
  if (!Number.isFinite(input.id) || input.id <= 0) throw new Error('Flowlu opportunity id is required.');

  const action = input.action || 'save';
  const payload: Record<string, string | number | undefined> = {};

  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Opportunity name is required.');
    payload.name = name;
  }
  if (input.budget !== undefined) {
    if (!Number.isFinite(input.budget) || input.budget < 0) throw new Error('Enter a valid budget.');
    payload.budget = input.budget;
  }
  if (input.pipelineId !== undefined) {
    if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) throw new Error('Choose a pipeline.');
    payload.pipeline_id = input.pipelineId;
  }
  if (input.stageId !== undefined) {
    if (!Number.isFinite(input.stageId) || input.stageId <= 0) throw new Error('Choose a stage.');
    payload.pipeline_stage_id = input.stageId;
  }
  if (input.sourceId !== undefined) payload.source_id = input.sourceId || 0;
  if (input.assigneeId !== undefined) payload.assignee_id = input.assigneeId || 0;
  if (input.description !== undefined) payload.description = String(input.description || '').trim() || ' ';
  if (input.deadline !== undefined) payload.deadline = String(input.deadline || '').trim() || ' ';

  if (action === 'won') {
    payload.active = 3;
    payload.closing_date = todayDate();
    payload.closing_status_id = 0;
    if (input.closingComment !== undefined) payload.closing_comment = String(input.closingComment || '').trim() || ' ';
  } else if (action === 'lost') {
    if (!Number.isFinite(input.lossReasonId) || Number(input.lossReasonId) <= 0) {
      throw new Error('Choose a loss reason before marking the deal Lost.');
    }
    payload.active = 2;
    payload.closing_date = todayDate();
    payload.closing_status_id = Number(input.lossReasonId);
    if (input.closingComment !== undefined) payload.closing_comment = String(input.closingComment || '').trim() || ' ';
  } else if (action === 'reopen') {
    payload.active = 1;
    payload.closing_status_id = 0;
  }

  if (!Object.keys(payload).length) throw new Error('No opportunity changes were provided.');

  const data = await flowluPost('crm/lead/update/' + input.id, payload);
  const mapped = mapOpportunity(data?.response);
  if (mapped) return mapped;

  const refreshed = await flowluGet('crm/lead/get/' + input.id);
  const fallback = mapOpportunity(refreshed?.response);
  if (!fallback) throw new Error('Flowlu updated the opportunity but did not return the updated record.');
  return fallback;
}
