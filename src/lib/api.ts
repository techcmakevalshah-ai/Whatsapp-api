import { supabase } from './supabase';
import type { CampaignSummary, Contact, ManagedWhatsAppTemplate, RecipientStatus, WhatsAppTemplate } from '../types';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export function getContacts(): Promise<{ contacts: Contact[]; syncedAt: string }> {
  return json('/api/contacts');
}

export function getTemplates(): Promise<{ templates: WhatsAppTemplate[] }> {
  return json('/api/whatsapp/templates');
}

export function sendCampaign(payload: {
  name: string;
  templateName: string;
  templateLanguage: string;
  contactIds: string[];
  variableValues: Record<string, string>;
  scheduledAt?: string;
  mediaUrl?: string;
}): Promise<{ campaignId: string; recipients: RecipientStatus[]; eligibleCount: number }> {
  return json('/api/whatsapp/send', { method: 'POST', body: JSON.stringify(payload) });
}

export function getCampaignStatus(campaignId: string): Promise<{
  campaignStatus: string;
  recipients: RecipientStatus[];
}> {
  return json(`/api/campaign-status?id=${encodeURIComponent(campaignId)}`);
}

export function getCampaigns(): Promise<{ campaigns: CampaignSummary[] }> {
  return json('/api/campaigns');
}

export function getManagedTemplates(): Promise<{ templates: ManagedWhatsAppTemplate[] }> {
  return json('/api/templates');
}

export function createManagedTemplate(payload: {
  name: string;
  language: string;
  category: string;
  body: string;
  footer?: string;
  status: 'DRAFT' | 'APPROVED';
  confirmProviderApproved?: boolean;
}): Promise<{ template: ManagedWhatsAppTemplate }> {
  return json('/api/templates', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateManagedTemplate(id: string, payload: {
  name: string;
  language: string;
  category: string;
  body: string;
  footer?: string;
  status: 'DRAFT' | 'APPROVED';
  confirmProviderApproved?: boolean;
}): Promise<{ template: ManagedWhatsAppTemplate }> {
  return json(`/api/templates?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function disableManagedTemplate(id: string): Promise<{ ok: true }> {
  return json(`/api/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
