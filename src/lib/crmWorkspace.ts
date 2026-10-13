import { supabase } from './supabase';
import type { FlowluLeadContext, FlowluLossReason, FlowluSalesMeta } from '../types';

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

export function getCrmWorkspaceMeta() {
  return crmJson<FlowluSalesMeta>('/api/contacts?action=flowlu-meta');
}

export function getCrmOpportunityBoard(filters: {
  pipelineId: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | 'in_progress' | 'won' | 'lost';
}) {
  const params = new URLSearchParams({
    action: 'flowlu-opportunity-board',
    pipelineId: String(filters.pipelineId),
    dealStatus: filters.dealStatus || 'all',
  });
  if (filters.assigneeId) params.set('assigneeId', String(filters.assigneeId));
  if (filters.sourceId) params.set('sourceId', String(filters.sourceId));
  return crmJson<{ contexts: FlowluLeadContext[]; leadCount: number }>(`/api/contacts?${params.toString()}`);
}

export function getCrmOpportunityDetail(id: number) {
  return crmJson<CrmOpportunityDetail>(`/api/contacts?action=flowlu-opportunity-detail&id=${encodeURIComponent(String(id))}`);
}

export function updateCrmOpportunity(payload: {
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
  return crmJson<{ ok: true; opportunity: unknown }>('/api/contacts?action=flowlu-opportunity-update', {
    method: 'PATCH', body: JSON.stringify(payload),
  });
}

export function createCrmOpportunity(payload: {
  name: string;
  pipelineId: number;
  stageId?: number;
  budget?: number;
  assigneeId?: number;
  sourceId?: number;
  accountId?: number;
}) {
  return crmJson<{ ok: true; opportunityId: number }>('/api/contacts?action=flowlu-opportunity-board-create', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export function createCrmStage(payload: { pipelineId: number; name: string; color: string }) {
  return crmJson<{ ok: true; stage: { id: number; name: string; color: string | null } }>('/api/contacts?action=flowlu-opportunity-stage-create', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export function searchCrmAccounts(search: string) {
  return crmJson<{ accounts: CrmAccountOption[] }>(`/api/contacts?action=flowlu-account-search&search=${encodeURIComponent(search)}`);
}

export function createCrmOpportunityComment(leadId: number, text: string) {
  return crmJson<{ ok: true; commentId: number | null }>('/api/contacts?action=flowlu-opportunity-comment', {
    method: 'POST', body: JSON.stringify({ leadId, text }),
  });
}
