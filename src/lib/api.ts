import { supabase } from './supabase';
import type { CampaignSummary, Contact, RecipientStatus, WhatsAppTemplate } from '../types';

async function authHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const auth = await authHeaders();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...(init?.headers || {}),
    },
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
