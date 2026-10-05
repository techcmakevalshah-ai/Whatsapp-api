import { flowluGet, flowluPost } from './flowluContacts.js';

export type FlowluOption = {
  id: number;
  name: string;
  active: boolean;
  pipelineId?: number | null;
};

export type FlowluLeadContext = {
  accountId: number;
  leadId: number;
  leadName: string;
  pipelineId: number | null;
  stageId: number | null;
  budget: number;
  assigneeId: number | null;
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

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function getFlowluOpportunityAudience(input: {
  pipelineId: number;
  stageId?: number;
}) {
  if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) {
    throw new Error('Choose a Flowlu pipeline.');
  }

  const leads = new Map<number, any>();
  let rowsSeen = 0;

  for (let page = 1; page <= 25; page += 1) {
    const query: Record<string, string | number> = {
      page,
      limit: 200,
      'filter[active]': 1,
      'filter[pipeline_id]': input.pipelineId,
    };
    if (input.stageId) query['filter[pipeline_stage_id]'] = input.stageId;

    const data = await flowluGet('crm/lead/list', query);
    const response = data?.response || {};
    const items = Array.isArray(response?.items) ? response.items : [];
    if (!items.length) break;

    for (const row of items) {
      const id = Number(row?.id || 0);
      if (id > 0) leads.set(id, row);
    }

    rowsSeen += items.length;
    const total = Number(response?.total || 0);
    if ((total > 0 && rowsSeen >= total) || items.length < Number(response?.count || 200)) break;
  }

  const leadIds = [...leads.keys()];
  if (!leadIds.length) {
    return { accountIds: [] as number[], contexts: [] as FlowluLeadContext[], leadCount: 0 };
  }

  const contexts = new Map<number, FlowluLeadContext>();

  for (const leadIdBatch of chunk(leadIds, 75)) {
    let relationRowsSeen = 0;

    for (let page = 1; page <= 20; page += 1) {
      const data = await flowluGet('crm/lead_accounts/list', {
        page,
        limit: 200,
        'filter[lead_id]': leadIdBatch.join(','),
        'filter[account_type]': 2,
      });
      const response = data?.response || {};
      const relations = Array.isArray(response?.items) ? response.items : [];
      if (!relations.length) break;

      for (const relation of relations) {
        const accountId = Number(relation?.account_id || 0);
        const leadId = Number(relation?.lead_id || 0);
        const lead = leads.get(leadId);
        if (!accountId || !lead) continue;

        const context: FlowluLeadContext = {
          accountId,
          leadId,
          leadName: String(lead?.name || 'Opportunity').trim() || 'Opportunity',
          pipelineId: Number(lead?.pipeline_id || 0) || null,
          stageId: Number(lead?.pipeline_stage_id || 0) || null,
          budget: Number(lead?.budget || 0),
          assigneeId: Number(lead?.assignee_id || 0) || null,
        };

        const existing = contexts.get(accountId);
        if (!existing || context.leadId > existing.leadId) contexts.set(accountId, context);
      }

      relationRowsSeen += relations.length;
      const total = Number(response?.total || 0);
      if ((total > 0 && relationRowsSeen >= total) || relations.length < 200) break;
    }
  }

  return {
    accountIds: [...contexts.keys()],
    contexts: [...contexts.values()],
    leadCount: leadIds.length,
  };
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

export async function writeFlowluWhatsAppActivity(input: {
  accountId: number;
  status: 'Read' | 'Failed';
  campaignName: string;
  templateName: string;
  occurredAt: string;
  error?: string | null;
}) {
  const when = new Date(input.occurredAt);
  const timestamp = Number.isNaN(when.getTime()) ? input.occurredAt : when.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const lines = [
    'WhatsApp ' + input.status,
    'Campaign: ' + (String(input.campaignName || '').trim() || 'WhatsApp Campaign'),
    'Template: ' + (String(input.templateName || '').trim() || '—'),
    'Time: ' + timestamp + ' IST',
  ];
  if (input.status === 'Failed' && input.error) lines.push('Error: ' + input.error);
  return createFlowluContactNote({ accountId: input.accountId, text: lines.join('\n') });
}
