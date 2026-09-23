import { supabase } from './supabase';
import type { CampaignSummary, Contact, DashboardStats, ManagedWhatsAppTemplate, MessageSeries, MessageSeriesScheduleSummary, MessageSeriesStep, RecipientStatus, RecurringCampaignSummary, StaffProfile, StaffUserProfile, TemplateFolder, WhatsAppTemplate } from '../types';

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
  timezone?: string;
  recurrenceDays?: number;
  mediaUrl?: string;
}): Promise<{
  campaignId?: string;
  recurring?: boolean;
  recurringSeriesId?: string;
  totalDays?: number;
  nextRunAt?: string;
  recipients: RecipientStatus[];
  eligibleCount: number;
}> {
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

export function getDashboardStats(): Promise<{ dashboard: DashboardStats }> {
  return json('/api/campaigns?view=dashboard');
}

export function getManagedTemplates(): Promise<{ templates: ManagedWhatsAppTemplate[]; folders: TemplateFolder[] }> {
  return json('/api/templates');
}

export function createManagedTemplate(payload: {
  name: string;
  language: string;
  category: string;
  body: string;
  footer?: string;
  status: 'DRAFT' | 'APPROVED';
  headerType?: 'IMAGE' | 'VIDEO' | null;
  folderId?: string | null;
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
  headerType?: 'IMAGE' | 'VIDEO' | null;
  folderId?: string | null;
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

export function sendTestMessage(payload: {
  phone: string;
  templateName: string;
  templateLanguage: string;
  variableValues: Record<string, string>;
  mediaUrl?: string;
}): Promise<{ ok: true; messageId?: string | null; phoneLast4: string }> {
  return json('/api/whatsapp/test', { method: 'POST', body: JSON.stringify(payload) });
}

export function addContact(payload: {
  name: string;
  phone: string;
  category?: string;
  status?: 'Active' | 'Inactive';
}): Promise<{ contact: Contact; contacts: Contact[]; syncedAt: string }> {
  return json('/api/contacts', { method: 'POST', body: JSON.stringify(payload) });
}

export function setContactStatus(
  id: string,
  status: 'Active' | 'Inactive',
): Promise<{ contact: Contact; contacts: Contact[]; syncedAt: string }> {
  return json(`/api/contacts?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function cancelCampaign(id: string): Promise<{ ok: true; status: string; canceledAt: string }> {
  return json(`/api/campaigns?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'cancel' }),
  });
}

export function rescheduleCampaign(
  id: string,
  scheduledAt: string,
  timezone: string,
): Promise<{ ok: true; status: string; scheduledAt: string; timezone: string }> {
  return json(`/api/campaigns?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'reschedule', scheduledAt, timezone }),
  });
}

export function getRecurringCampaigns(): Promise<{ recurringCampaigns: RecurringCampaignSummary[] }> {
  return json('/api/recurring-campaigns');
}

export function updateRecurringCampaign(
  id: string,
  action: 'pause' | 'resume' | 'cancel',
): Promise<{ ok: true; status: string; nextRunAt?: string }> {
  return json(`/api/recurring-campaigns?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

export function getMessageSeries(): Promise<{ series: MessageSeries[] }> {
  return json('/api/message-series');
}

export function createMessageSeries(payload: {
  name: string;
  description?: string;
  steps: MessageSeriesStep[];
}): Promise<{ series: MessageSeries }> {
  return json('/api/message-series', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMessageSeries(id: string, payload: {
  name: string;
  description?: string;
  steps: MessageSeriesStep[];
}): Promise<{ series: MessageSeries }> {
  return json(`/api/message-series?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function disableMessageSeries(id: string): Promise<{ ok: true }> {
  return json(`/api/message-series?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function scheduleMessageSeries(payload: {
  name: string;
  seriesId: string;
  contactIds: string[];
  startAt: string;
  timezone: string;
}): Promise<{
  ok: true;
  scheduleId: string;
  seriesId: string;
  seriesName: string;
  totalDays: number;
  eligibleCount: number;
  nextRunAt: string;
}> {
  return json('/api/message-series', {
    method: 'POST',
    body: JSON.stringify({ ...payload, action: 'schedule' }),
  });
}

export function getMessageSeriesSchedules(): Promise<{ schedules: MessageSeriesScheduleSummary[] }> {
  return json('/api/message-series?view=schedules');
}

export function updateMessageSeriesSchedule(
  id: string,
  action: 'pause' | 'resume' | 'cancel',
): Promise<{ ok: true; status: string; nextRunAt?: string }> {
  return json(`/api/message-series?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ scope: 'schedule', action }),
  });
}

export function createTemplateFolder(payload: {
  name: string;
  description?: string;
}): Promise<{ folder: TemplateFolder }> {
  return json('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ scope: 'folder', ...payload }),
  });
}

export function updateTemplateFolder(
  id: string,
  payload: { name: string; description?: string },
): Promise<{ folder: TemplateFolder }> {
  return json(`/api/templates?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ scope: 'folder', ...payload }),
  });
}

export function archiveTemplateFolder(id: string): Promise<{ ok: true }> {
  return json(`/api/templates?scope=folder&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function moveManagedTemplate(
  id: string,
  folderId: string | null,
): Promise<{ template: ManagedWhatsAppTemplate }> {
  return json(`/api/templates?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ scope: 'move', folderId }),
  });
}

export function getCurrentStaffProfile(): Promise<{ profile: StaffProfile }> {
  return json('/api/users?view=me');
}

export function getStaffUsers(): Promise<{ users: StaffUserProfile[] }> {
  return json('/api/users');
}

export function inviteStaffUser(payload: {
  fullName: string;
  email: string;
  role: 'admin' | 'staff';
}): Promise<{ user: StaffUserProfile; invitationSent: boolean }> {
  return json('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateStaffUser(
  id: string,
  payload:
    | { action: 'revoke' }
    | { action: 'reactivate' }
    | { action: 'update_profile'; fullName: string; role: 'admin' | 'staff' }
    | { action: 'delete_user'; primaryAdminPassword: string },
): Promise<{ ok: true; status?: string }> {
  return json(`/api/users?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function completePasswordSetup(): Promise<{ ok: true }> {
  return json('/api/users?view=me', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'password_setup_complete' }),
  });
}
