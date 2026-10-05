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

export function getFlowluOpportunityAudience(pipelineId: number, stageId?: number) {
  const params = new URLSearchParams({
    action: 'flowlu-opportunity-audience',
    source: 'flowlu',
    pipelineId: String(pipelineId),
  });
  if (stageId) params.set('stageId', String(stageId));

  return authenticatedJson<{
    accountIds: number[];
    contexts: FlowluLeadContext[];
    leadCount: number;
  }>('/api/contacts?' + params.toString());
}
