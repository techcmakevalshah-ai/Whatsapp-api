import { flowluGet, flowluPost } from './flowluContacts.js';

export type WorkspaceDealStatus = 'in_progress' | 'won' | 'lost';

function dealStatus(value: unknown): WorkspaceDealStatus {
  const active = Number(value || 1);
  if (active === 2) return 'lost';
  if (active === 3) return 'won';
  return 'in_progress';
}

function dealStatusActive(status?: string) {
  if (status === 'lost') return 2;
  if (status === 'won') return 3;
  if (status === 'in_progress') return 1;
  return undefined;
}

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export async function getFlowluOpportunityWorkspace(input: {
  pipelineId: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | WorkspaceDealStatus;
}) {
  if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) throw new Error('Choose a Flowlu pipeline.');

  const leads: any[] = [];
  let rowsSeen = 0;
  for (let page = 1; page <= 25; page += 1) {
    const query: Record<string, string | number> = {
      page,
      limit: 200,
      'filter[pipeline_id]': input.pipelineId,
    };
    if (input.assigneeId) query['filter[assignee_id]'] = input.assigneeId;
    if (input.sourceId) query['filter[source_id]'] = input.sourceId;
    const active = dealStatusActive(input.dealStatus);
    if (active) query['filter[active]'] = active;

    const data = await flowluGet('crm/lead/list', query);
    const response = data?.response || {};
    const items = Array.isArray(response?.items) ? response.items : [];
    if (!items.length) break;

    for (const row of items) {
      const pipelineId = Number(row?.pipeline_id || 0);
      if (pipelineId !== input.pipelineId) continue;
      const status = dealStatus(row?.active);
      if (input.dealStatus && input.dealStatus !== 'all' && status !== input.dealStatus) continue;
      leads.push(row);
    }

    rowsSeen += items.length;
    const total = Number(response?.total || 0);
    if ((total > 0 && rowsSeen >= total) || items.length < 200) break;
  }

  const leadIds = leads.map((row) => Number(row?.id || 0)).filter((id) => id > 0);
  const accountByLead = new Map<number, number>();

  for (const batch of chunk(leadIds, 75)) {
    let relationRowsSeen = 0;
    for (let page = 1; page <= 20; page += 1) {
      const data = await flowluGet('crm/lead_accounts/list', {
        page,
        limit: 200,
        'filter[lead_id]': batch.join(','),
        'filter[account_type]': 2,
      });
      const response = data?.response || {};
      const relations = Array.isArray(response?.items) ? response.items : [];
      if (!relations.length) break;
      for (const relation of relations) {
        const leadId = Number(relation?.lead_id || 0);
        const accountId = Number(relation?.account_id || 0);
        if (leadId && accountId && !accountByLead.has(leadId)) accountByLead.set(leadId, accountId);
      }
      relationRowsSeen += relations.length;
      const total = Number(response?.total || 0);
      if ((total > 0 && relationRowsSeen >= total) || relations.length < 200) break;
    }
  }

  const baseContexts = leads.map((row) => ({
    accountId: accountByLead.get(Number(row?.id || 0)) || 0,
    leadId: Number(row?.id || 0),
    leadName: String(row?.name || 'Opportunity').trim() || 'Opportunity',
    pipelineId: Number(row?.pipeline_id || 0) || null,
    stageId: Number(row?.pipeline_stage_id || 0) || null,
    budget: Number(row?.budget || 0),
    assigneeId: Number(row?.assignee_id || 0) || null,
    sourceId: Number(row?.source_id || 0) || null,
    status: dealStatus(row?.active),
    startDate: String(row?.start_date || row?.created || '').trim(),
    deadline: String(row?.deadline || '').trim(),
  })).filter((item) => item.leadId > 0);

  const accountInfo = new Map<number, { name: string; phone: string }>();
  const accountIds = [...new Set(baseContexts.map((item) => item.accountId).filter((id) => id > 0))];
  await mapWithConcurrency(accountIds, 8, async (accountId) => {
    try {
      const data = await flowluGet('crm/account/get/' + accountId);
      const row = data?.response || {};
      const name = String(row?.name || '').trim() || [row?.first_name, row?.last_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
      const phone = String(row?.phone || row?.phone_work || row?.phone_mobile || '').trim();
      accountInfo.set(accountId, { name: name || `Contact #${accountId}`, phone });
    } catch {
      accountInfo.set(accountId, { name: `Contact #${accountId}`, phone: '' });
    }
  });

  const commentCountByLead = new Map<number, number>();
  const countableLeads = baseContexts.slice(0, 80).map((item) => item.leadId);
  await mapWithConcurrency(countableLeads, 8, async (leadId) => {
    try {
      const data = await flowluGet('crm/lead/' + leadId + '/comments/list', { page: 1, limit: 1 });
      const response = data?.response || {};
      const items = Array.isArray(response?.items) ? response.items : [];
      const total = Number(response?.total || 0);
      commentCountByLead.set(leadId, total > 0 ? total : items.length);
    } catch {
      commentCountByLead.set(leadId, 0);
    }
  });

  const contexts = baseContexts.map((item) => ({
    ...item,
    accountName: item.accountId ? accountInfo.get(item.accountId)?.name || `Contact #${item.accountId}` : '',
    accountPhone: item.accountId ? accountInfo.get(item.accountId)?.phone || '' : '',
    commentCount: commentCountByLead.get(item.leadId) || 0,
  }));

  return { contexts, leadCount: contexts.length };
}

export async function createFlowluPipelineStage(input: {
  pipelineId: number;
  name: string;
  color?: string;
}) {
  const name = String(input.name || '').trim();
  if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) throw new Error('Choose a pipeline.');
  if (!name) throw new Error('Stage name is required.');

  const color = String(input.color || '').trim();
  const data = await flowluPost('crm/pipeline_stage/create', {
    pipeline_id: input.pipelineId,
    name,
    color: color || undefined,
    active: 1,
  });
  const id = Number(data?.response?.id || 0);
  if (!id) throw new Error('Flowlu did not return the new stage id.');
  return { id, name, color: color || null };
}

export async function createFlowluWorkspaceOpportunity(input: {
  name: string;
  pipelineId: number;
  stageId?: number;
  budget?: number;
  assigneeId?: number;
  sourceId?: number;
  accountId?: number;
}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Opportunity name is required.');
  if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) throw new Error('Choose a pipeline.');

  const data = await flowluPost('crm/lead/create', {
    name,
    pipeline_id: input.pipelineId,
    pipeline_stage_id: input.stageId,
    budget: Number.isFinite(input.budget) ? Number(input.budget) : 0,
    assignee_id: input.assigneeId,
    source_id: input.sourceId,
    active: 1,
  });
  const leadId = Number(data?.response?.id || 0);
  if (!leadId) throw new Error('Flowlu opportunity could not be created.');

  if (input.accountId && Number.isFinite(input.accountId) && input.accountId > 0) {
    await flowluPost('crm/lead_accounts/create', {
      lead_id: leadId,
      account_id: input.accountId,
      account_type: 2,
    });
  }

  return { id: leadId };
}

export async function searchFlowluAccounts(search: string) {
  const query = String(search || '').trim();
  if (query.length < 2) return [];
  const data = await flowluGet('crm/account/list', { page: 1, limit: 25, search: query });
  const items = Array.isArray(data?.response?.items) ? data.response.items : [];
  return items.map((row: any) => ({
    id: Number(row?.id || 0),
    name: String(row?.name || '').trim() || [row?.first_name, row?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' '),
    phone: String(row?.phone || row?.phone_work || row?.phone_mobile || '').trim(),
    email: String(row?.email || '').trim(),
  })).filter((row: any) => row.id > 0 && row.name);
}

export async function getFlowluOpportunityDetail(leadId: number) {
  if (!Number.isFinite(leadId) || leadId <= 0) throw new Error('Opportunity id is required.');

  const [leadData, relationData, commentsData] = await Promise.all([
    flowluGet('crm/lead/get/' + leadId),
    flowluGet('crm/lead_accounts/list', { page: 1, limit: 20, 'filter[lead_id]': leadId, 'filter[account_type]': 2 }),
    flowluGet('crm/lead/' + leadId + '/comments/list', { page: 1, limit: 100 }),
  ]);

  const lead = leadData?.response || {};
  const relations = Array.isArray(relationData?.response?.items) ? relationData.response.items : [];
  const accountId = Number(relations[0]?.account_id || 0);
  let account: any = null;
  if (accountId) {
    try {
      const accountData = await flowluGet('crm/account/get/' + accountId);
      const row = accountData?.response || {};
      account = {
        id: accountId,
        name: String(row?.name || '').trim() || [row?.first_name, row?.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' '),
        phone: String(row?.phone || row?.phone_work || row?.phone_mobile || '').trim(),
        email: String(row?.email || '').trim(),
      };
    } catch {
      account = { id: accountId, name: 'Linked contact', phone: '', email: '' };
    }
  }

  const commentRows = Array.isArray(commentsData?.response?.items) ? commentsData.response.items : [];
  const comments = commentRows.map((row: any) => ({
    id: Number(row?.id || 0),
    text: stripHtml(row?.text || row?.comment || row?.description || ''),
    createdAt: String(row?.created || row?.created_at || row?.date || row?.datetime || '').trim(),
    authorId: Number(row?.created_by || row?.user_id || row?.author_id || row?.owner_id || 0) || null,
    authorName: String(row?.author_name || row?.user_name || row?.created_by_name || '').trim(),
  })).filter((row: any) => row.id > 0 || row.text);

  return {
    opportunity: {
      id: leadId,
      name: String(lead?.name || '').trim(),
      pipelineId: Number(lead?.pipeline_id || 0) || null,
      stageId: Number(lead?.pipeline_stage_id || 0) || null,
      budget: Number(lead?.budget || 0),
      assigneeId: Number(lead?.assignee_id || 0) || null,
      sourceId: Number(lead?.source_id || 0) || null,
      startDate: String(lead?.start_date || lead?.created || '').trim(),
      deadline: String(lead?.deadline || '').trim(),
      description: stripHtml(lead?.description || ''),
      status: dealStatus(lead?.active),
    },
    account,
    comments,
  };
}

export async function createFlowluOpportunityComment(input: { leadId: number; text: string }) {
  if (!Number.isFinite(input.leadId) || input.leadId <= 0) throw new Error('Opportunity id is required.');
  const text = String(input.text || '').trim();
  if (!text) throw new Error('Enter a comment.');

  const data = await flowluPost('crm/lead/' + input.leadId + '/comments/create', {
    text: '<p>' + escapeHtml(text) + '</p>',
  });
  return { id: Number(data?.response?.id || 0) || null };
}
