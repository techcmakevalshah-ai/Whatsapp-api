import { supabase } from './supabase';
import type { FlowluLeadContext } from '../types';

async function authenticatedJson<T>(url: string): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

export type FlowluAudienceFilters = {
  pipelineId?: number;
  stageId?: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | 'in_progress' | 'won' | 'lost';
  minBudget?: number;
  maxBudget?: number;
};

export function getFlowluOpportunityAudience(filters: FlowluAudienceFilters) {
  const params = new URLSearchParams({
    action: 'flowlu-opportunity-audience',
    source: 'flowlu',
  });

  if (filters.pipelineId) params.set('pipelineId', String(filters.pipelineId));
  if (filters.stageId) params.set('stageId', String(filters.stageId));
  if (filters.assigneeId) params.set('assigneeId', String(filters.assigneeId));
  if (filters.sourceId) params.set('sourceId', String(filters.sourceId));
  if (filters.dealStatus && filters.dealStatus !== 'all') params.set('dealStatus', filters.dealStatus);
  if (Number.isFinite(filters.minBudget)) params.set('minBudget', String(filters.minBudget));
  if (Number.isFinite(filters.maxBudget)) params.set('maxBudget', String(filters.maxBudget));

  return authenticatedJson<{
    accountIds: number[];
    contexts: FlowluLeadContext[];
    leadCount: number;
  }>('/api/contacts?' + params.toString());
}
