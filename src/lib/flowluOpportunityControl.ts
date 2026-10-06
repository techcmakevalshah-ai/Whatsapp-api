import { supabase } from './supabase';
import type { FlowluLossReason, FlowluOpportunity } from '../types';

async function flowluControlJson<T>(url: string, init?: RequestInit): Promise<T> {
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

export function getFlowluContactOpportunities(accountId: number) {
  return flowluControlJson<{
    opportunities: FlowluOpportunity[];
    lossReasons: FlowluLossReason[];
  }>(`/api/contacts?action=flowlu-opportunities&accountId=${encodeURIComponent(String(accountId))}`);
}

export function updateFlowluOpportunity(payload: {
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
  return flowluControlJson<{ ok: true; opportunity: FlowluOpportunity }>(
    '/api/contacts?action=flowlu-opportunity-update',
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}
