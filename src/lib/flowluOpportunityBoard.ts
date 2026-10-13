import { supabase } from './supabase';
import type { FlowluLeadContext } from '../types';

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

export function getFlowluOpportunityBoard(filters: {
  pipelineId?: number;
  stageId?: number;
  assigneeId?: number;
  sourceId?: number;
  dealStatus?: 'all' | 'in_progress' | 'won' | 'lost';
} = {}) {
  const params = new URLSearchParams({ action: 'flowlu-opportunity-audience' });
  if (filters.pipelineId) params.set('pipelineId', String(filters.pipelineId));
  if (filters.stageId) params.set('stageId', String(filters.stageId));
  if (filters.assigneeId) params.set('assigneeId', String(filters.assigneeId));
  if (filters.sourceId) params.set('sourceId', String(filters.sourceId));
  params.set('dealStatus', filters.dealStatus || 'all');
  return crmJson<{ accountIds: number[]; contexts: FlowluLeadContext[]; leadCount: number }>(`/api/contacts?${params.toString()}`);
}
