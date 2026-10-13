import { flowluGet, flowluPost } from './flowluContacts.js';
import { readFlowluContactCache } from './flowluCache.js';

export type WorkspaceDealStatus = 'in_progress' | 'won' | 'lost';

export type WorkspacePipelineStage = {
  id: number;
  name: string;
  pipelineId: number;
  ordering: number;
  color: string | null;
  active: boolean;
};

type WorkspaceCard = {
  accountId: number;
  leadId: number;
  leadName: string;
  pipelineId: number | null;
  stageId: number | null;
  budget: number;
  assigneeId: number | null;
  sourceId: number | null;
  status: WorkspaceDealStatus;
  startDate: string;
  deadline: string;
  accountName: string;
  accountPhone: string;
  commentCount: number;
};

type WorkspaceBoardResult = {
  contexts: WorkspaceCard[];
  leadCount: number;
  stages: WorkspacePipelineStage[];
  cached?: boolean;
  stale?: boolean;
  fetchedAt?: string;
};

const BOARD_FRESH_MS = 45 * 1000;
const BOARD_STALE_MS = 10 * 60 * 1000;
const STAGE_CACHE_MS = 10 * 60 * 1000;

const boardCache = new Map<number, { freshUntil: number; staleUntil: number; value: WorkspaceBoardResult }>();
const boardInFlight = new Map<number, Promise<WorkspaceBoardResult>>();
const stageCache = new Map<number, { expiresAt: number; value: WorkspacePipelineStage[] }>();

function dealStatus(value: unknown): WorkspaceDealStatus {
  const active = Number(value || 1);
  if (active === 2) return 'lost';
  if (active === 3) return 'won';
  return 'in_progress';
}

function activeFlag(value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  return ![0, '0', false, 'false', 'inactive'].includes(
    typeof value === 'string' ? value.toLowerCase() : value as any,
  );
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

function normalizeStage(row: any, pipelineId: number): WorkspacePipelineStage | null {
  const id = Number(row?.id || 0);
  const name = String(row?.name || '').trim();
  const rowPipelineId = Number(row?.pipeline_id || pipelineId || 0);
  if (!id || !name || rowPipelineId !== pipelineId || !activeFlag(row?.active)) return null;
  return {
    id,
    name,
    pipelineId: rowPipelineId,
    ordering: Number(row?.ordering ?? row?.sort ?? row?.position ?? 0),
    color: String(row?.color || '').trim() || null,
    active: true,
  };
}

export function invalidateFlowluOpportunityWorkspaceCache(pipelineId?: number) {
  if (!pipelineId) {
    boardCache.clear();
    stageCache.clear();
    return;
  }
  boardCache.delete(pipelineId);
  stageCache.delete(pipelineId);
}

async function fetchPipelineStages(pipelineId: number) {
  const cached = stageCache.get(pipelineId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const byId = new Map<number, WorkspacePipelineStage>();
  let rowsSeen = 0;

  for (let page = 1; page <= 10; page += 1) {
    const data = await flowluGet('crm/pipeline_stage/list', {
      page,
      limit: 200,
      'filter[pipeline_id]': pipelineId,
    });
    const response = data?.response || {};
    const rows = Array.isArray(response?.items) ? response.items : [];
    if (!rows.length) break;

    for (const row of rows) {
      const stage = normalizeStage(row, pipelineId);
      if (stage) byId.set(stage.id, stage);
    }

    rowsSeen += rows.length;
    const total = Number(response?.total || 0);
    if ((total > 0 && rowsSeen >= total) || rows.length < 200) break;
  }

  const stages = [...byId.values()].sort((a, b) => {
    if (a.ordering !== b.ordering) return a.ordering - b.ordering;
    return a.id - b.id;
  });
  stageCache.set(pipelineId, { expiresAt: Date.now() + STAGE_CACHE_MS, value: stages });
  return stages;
}

async function buildPipelineSnapshot(pipelineId: number): Promise<WorkspaceBoardResult> {
  const leadsById = new Map<number, any>();
  let rowsSeen = 0;

  for (let page = 1; page <= 25; page += 1) {
    const data = await flowluGet('crm/lead/list', {
      page,
      limit: 200,
      'filter[pipeline_id]': pipelineId,
    });
    const response = data?.response || {};
    const items = Array.isArray(response?.items) ? response.items : [];
    if (!items.length) break;

    for (const row of items) {
      const id = Number(row?.id || 0);
      const rowPipelineId = Number(row?.pipeline_id || 0);
      if (!id || rowPipelineId !== pipelineId) continue;
      leadsById.set(id, row);
    }

    rowsSeen += items.length;
    const total = Number(response?.total || 0);
    if ((total > 0 && rowsSeen >= total) || items.length < 200) break;
  }

  const leads = [...leadsById.values()];
  const accountByLead = new Map<number, number>();
  const relationNameByLead = new Map<number, string>();
  const relationPhoneByLead = new Map<number, string>();

  for (const row of leads) {
    const leadId = Number(row?.id || 0);
    const directAccountId = Number(row?.contact_id || row?.account_id || row?.company_id || 0);
    if (leadId && directAccountId) accountByLead.set(leadId, directAccountId);
  }

  const leadsNeedingRelation = [...leadsById.keys()].filter((leadId) => !accountByLead.has(leadId));
  for (const batch of chunk(leadsNeedingRelation, 75)) {
    const data = await flowluGet('crm/lead_accounts/list', {
      page: 1,
      limit: 200,
      'filter[lead_id]': batch.join(','),
      'filter[account_type]': 2,
    });
    const relations = Array.isArray(data?.response?.items) ? data.response.items : [];
    for (const relation of relations) {
      const leadId = Number(relation?.lead_id || 0);
      const accountId = Number(relation?.account_id || 0);
      if (!leadId || !accountId || !leadsById.has(leadId) || accountByLead.has(leadId)) continue;
      accountByLead.set(leadId, accountId);
      const name = String(relation?.account_name || relation?.name || relation?.contact_name || '').trim();
      const phone = String(relation?.phone || relation?.mobile || '').trim();
      if (name) relationNameByLead.set(leadId, name);
      if (phone) relationPhoneByLead.set(leadId, phone);
    }
  }

  const cachedContactById = new Map<number, { name: string; phone: string }>();
  try {
    const cachedContacts = await readFlowluContactCache();
    for (const contact of cachedContacts?.contacts || []) {
      cachedContactById.set(contact.flowluId, { name: contact.name, phone: contact.phone });
    }
  } catch {
    // The board can still render names returned directly by Flowlu leads.
  }

  const contexts: WorkspaceCard[] = leads.map((row) => {
    const leadId = Number(row?.id || 0);
    const accountId = accountByLead.get(leadId) || 0;
    const cachedContact = accountId ? cachedContactById.get(accountId) : undefined;
    const directName = String(
      row?.contact_name || row?.account_name || row?.client_name || row?.company_name || row?.contact_company || '',
    ).trim();
    const directPhone = String(
      row?.contact_mobile || row?.contact_phone || row?.phone || row?.mobile || '',
    ).trim();

    return {
      accountId,
      leadId,
      leadName: String(row?.name || 'Opportunity').trim() || 'Opportunity',
      pipelineId: Number(row?.pipeline_id || 0) || null,
      stageId: Number(row?.pipeline_stage_id || 0) || null,
      budget: Number(row?.budget || 0),
      assigneeId: Number(row?.assignee_id || 0) || null,
      sourceId: Number(row?.source_id || 0) || null,
      status: dealStatus(row?.active),
      startDate: String(row?.start_date || row?.created || '').trim(),
      deadline: String(row?.deadline || '').trim(),
      accountName: directName || relationNameByLead.get(leadId) || cachedContact?.name || (accountId ? `Contact #${accountId}` : ''),
      accountPhone: directPhone || relationPhoneByLead.get(leadId) || cachedContact?.phone || '',
      commentCount: Number(row?.comments_count || row?.comment_count || row?.comments_total || 0) || 0,
    };
  }).filter((item) => item.leadId > 0);

  const stages = await fetchPipelineStages(pipelineId);
  return {
    contexts,
    leadCount: contexts.length,
    stages,
    fetchedAt: new Date().toISOString(),
  };
}

function filterSnapshot(snapshot: WorkspaceBoardResult, input: {
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | WorkspaceDealStatus;
}) {
  const contexts = snapshot.contexts.filter((item) => {
    if (input.assigneeId && item.assigneeId !== input.assigneeId) return false;
    if (input.sourceId && item.sourceId !== input.sourceId) return false;
    if (input.dealStatus && input.dealStatus !== 'all' && item.status !== input.dealStatus) return false;
    return true;
  });
  return { ...snapshot, contexts, leadCount: contexts.length };
}

export async function getFlowluOpportunityWorkspace(input: {
  pipelineId: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | WorkspaceDealStatus;
  force?: boolean;
}) {
  if (!Number.isFinite(input.pipelineId) || input.pipelineId <= 0) throw new Error('Choose a Flowlu pipeline.');

  const cached = boardCache.get(input.pipelineId);
  if (!input.force && cached && cached.freshUntil > Date.now()) {
    return filterSnapshot({ ...cached.value, cached: true, stale: false }, input);
  }

  const running = boardInFlight.get(input.pipelineId);
  if (running) {
    const snapshot = await running;
    return filterSnapshot(snapshot, input);
  }

  const task = buildPipelineSnapshot(input.pipelineId)
    .then((value) => {
      const now = Date.now();
      boardCache.set(input.pipelineId, {
        freshUntil: now + BOARD_FRESH_MS,
        staleUntil: now + BOARD_STALE_MS,
        value,
      });
      return value;
    })
    .catch((error) => {
      const stale = boardCache.get(input.pipelineId);
      if (stale && stale.staleUntil > Date.now()) {
        return { ...stale.value, cached: true, stale: true };
      }
      throw error;
    })
    .finally(() => boardInFlight.delete(input.pipelineId));

  boardInFlight.set(input.pipelineId, task);
  const snapshot = await task;
  return filterSnapshot(snapshot, input);
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
  invalidateFlowluOpportunityWorkspaceCache(input.pipelineId);
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

  invalidateFlowluOpportunityWorkspaceCache(input.pipelineId);
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
  const accountId = Number(relations[0]?.account_id || lead?.contact_id || lead?.account_id || 0);
  let account: any = null;

  if (accountId) {
    try {
      const cachedContacts = await readFlowluContactCache();
      const cached = cachedContacts?.contacts.find((item) => item.flowluId === accountId);
      if (cached) account = { id: accountId, name: cached.name, phone: cached.phone, email: cached.email || '' };
    } catch {
      // Continue with direct Flowlu fallback only for the opened record.
    }

    if (!account) {
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
  invalidateFlowluOpportunityWorkspaceCache();
  return { id: Number(data?.response?.id || 0) || null };
}
