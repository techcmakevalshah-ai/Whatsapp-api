import { supabase } from './supabase';
import type { FlowluLeadContext, FlowluLossReason, FlowluOption, FlowluSalesMeta } from '../types';

export type CrmAccountOption = { id: number; name: string; phone: string; email: string };
export type CrmOpportunityComment = { id: number; text: string; createdAt: string; authorId: number | null; authorName: string };
export type CrmOpportunityDetail = {
  opportunity: {
    id: number;
    name: string;
    pipelineId: number | null;
    stageId: number | null;
    budget: number;
    assigneeId: number | null;
    sourceId: number | null;
    startDate: string;
    deadline: string;
    description: string;
    status: 'in_progress' | 'won' | 'lost';
  };
  account: CrmAccountOption | null;
  comments: CrmOpportunityComment[];
  lossReasons: FlowluLossReason[];
};

type CrmBoardResult = {
  contexts: FlowluLeadContext[];
  leadCount: number;
  stages: FlowluOption[];
  cached?: boolean;
  stale?: boolean;
  fetchedAt?: string;
};

type StoredValue<T> = { savedAt: number; value: T };

const META_KEY = 'crm_workspace_meta_v3';
const BOARD_PREFIX = 'crm_board_v3:';
const META_FRESH_MS = 30 * 60 * 1000;
const META_STALE_MS = 24 * 60 * 60 * 1000;
const BOARD_FRESH_MS = 30 * 1000;
const BOARD_STALE_MS = 30 * 60 * 1000;

let latestMeta: FlowluSalesMeta | null = null;

function storageGet<T>(key: string): StoredValue<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredValue<T>;
    if (!parsed || typeof parsed.savedAt !== 'number' || parsed.value == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storageSet<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies StoredValue<T>));
  } catch {
    // Storage can be unavailable in privacy modes; live fetching still works.
  }
}

function boardStorageKey(filters: {
  pipelineId: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | 'in_progress' | 'won' | 'lost';
}) {
  return BOARD_PREFIX + [
    filters.pipelineId,
    filters.assigneeId || 0,
    filters.sourceId || 0,
    filters.dealStatus || 'all',
  ].join(':');
}

function clearBoardStorage() {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(BOARD_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }
}

async function crmJson<T>(url: string, init?: RequestInit): Promise<T> {
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

export async function getCrmWorkspaceMeta() {
  if (latestMeta) return latestMeta;

  const stored = storageGet<FlowluSalesMeta>(META_KEY);
  if (stored && Date.now() - stored.savedAt < META_FRESH_MS) {
    latestMeta = stored.value;
    return stored.value;
  }

  try {
    const meta = await crmJson<FlowluSalesMeta>('/api/contacts?action=flowlu-meta');
    latestMeta = meta;
    storageSet(META_KEY, meta);
    return meta;
  } catch (error) {
    if (stored && Date.now() - stored.savedAt < META_STALE_MS) {
      latestMeta = stored.value;
      return stored.value;
    }
    throw error;
  }
}

export async function getCrmOpportunityBoard(filters: {
  pipelineId: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | 'in_progress' | 'won' | 'lost';
}) {
  const storageKey = boardStorageKey(filters);
  const stored = storageGet<CrmBoardResult>(storageKey);

  if (stored && Date.now() - stored.savedAt < BOARD_FRESH_MS) {
    const cached = { ...stored.value, cached: true, stale: false };
    if (latestMeta && cached.stages?.length) {
      latestMeta.stages = [
        ...latestMeta.stages.filter((stage) => stage.pipelineId !== filters.pipelineId),
        ...cached.stages,
      ];
    }
    return cached;
  }

  const params = new URLSearchParams({
    action: 'flowlu-opportunity-board',
    pipelineId: String(filters.pipelineId),
    dealStatus: filters.dealStatus || 'all',
  });
  if (filters.assigneeId) params.set('assigneeId', String(filters.assigneeId));
  if (filters.sourceId) params.set('sourceId', String(filters.sourceId));

  try {
    const data = await crmJson<CrmBoardResult>(`/api/contacts?${params.toString()}`);

    if (latestMeta && Array.isArray(data.stages) && data.stages.length) {
      latestMeta.stages = [
        ...latestMeta.stages.filter((stage) => stage.pipelineId !== filters.pipelineId),
        ...data.stages,
      ];
      storageSet(META_KEY, latestMeta);
    }

    storageSet(storageKey, data);
    return data;
  } catch (error) {
    if (stored && Date.now() - stored.savedAt < BOARD_STALE_MS) {
      const cached = { ...stored.value, cached: true, stale: true };
      if (latestMeta && cached.stages?.length) {
        latestMeta.stages = [
          ...latestMeta.stages.filter((stage) => stage.pipelineId !== filters.pipelineId),
          ...cached.stages,
        ];
      }
      return cached;
    }
    throw error;
  }
}

export function getCrmOpportunityDetail(id: number) {
  return crmJson<CrmOpportunityDetail>(`/api/contacts?action=flowlu-opportunity-detail&id=${encodeURIComponent(String(id))}`);
}

export async function updateCrmOpportunity(payload: {
  id: number;
  name?: string;
  budget?: number;
  pipelineId?: number;
  stageId?: number;
  sourceId?: number | null;
  assigneeId?: number | null;
  description?: string;
  deadline?: string;
  opportunityAction?: 'save' | 'won' | 'lost' | 'reopen';
  lossReasonId?: number;
  closingComment?: string;
}) {
  const result = await crmJson<{ ok: true; opportunity: unknown }>('/api/contacts?action=flowlu-opportunity-update', {
    method: 'PATCH', body: JSON.stringify(payload),
  });
  clearBoardStorage();
  return result;
}

export async function createCrmOpportunity(payload: {
  name: string;
  pipelineId: number;
  stageId?: number;
  budget?: number;
  assigneeId?: number;
  sourceId?: number;
  accountId?: number;
}) {
  const result = await crmJson<{ ok: true; opportunityId: number }>('/api/contacts?action=flowlu-opportunity-board-create', {
    method: 'POST', body: JSON.stringify(payload),
  });
  clearBoardStorage();
  return result;
}

export async function createCrmStage(payload: { pipelineId: number; name: string; color: string }) {
  const result = await crmJson<{ ok: true; stage: { id: number; name: string; color: string | null } }>('/api/contacts?action=flowlu-opportunity-stage-create', {
    method: 'POST', body: JSON.stringify(payload),
  });
  clearBoardStorage();
  latestMeta = null;
  try { window.localStorage.removeItem(META_KEY); } catch { /* ignore */ }
  return result;
}

export function searchCrmAccounts(search: string) {
  return crmJson<{ accounts: CrmAccountOption[] }>(`/api/contacts?action=flowlu-account-search&search=${encodeURIComponent(search)}`);
}

export async function createCrmOpportunityComment(leadId: number, text: string) {
  const result = await crmJson<{ ok: true; commentId: number | null }>('/api/contacts?action=flowlu-opportunity-comment', {
    method: 'POST', body: JSON.stringify({ leadId, text }),
  });
  clearBoardStorage();
  return result;
}
