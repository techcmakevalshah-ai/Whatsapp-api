import { supabase } from './supabase';

export type AppReminder = {
  id: string;
  title: string;
  note?: string | null;
  remindAt: string;
  status: 'pending' | 'completed' | 'cancelled' | string;
  snoozeCount: number;
  contactSource?: 'flowlu' | 'sheet' | null;
  contactId?: string | null;
  flowluId?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

async function reminderJson<T>(url: string, init?: RequestInit): Promise<T> {
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

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('reminders:changed'));
}

export function getReminders(scope: 'pending' | 'all' = 'pending') {
  return reminderJson<{ reminders: AppReminder[] }>(`/api/contacts?action=reminders&scope=${scope}`);
}

export async function createReminder(payload: {
  title: string;
  note?: string;
  remindAt: string;
  contactSource?: 'flowlu' | 'sheet';
  contactId?: string;
  flowluId?: number;
  contactName?: string;
  contactPhone?: string;
}) {
  const result = await reminderJson<{ reminder: AppReminder }>('/api/contacts?action=reminder-create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  changed();
  return result;
}

export async function updateReminder(payload: {
  id: string;
  reminderAction: 'complete' | 'cancel' | 'snooze';
  minutes?: number;
  remindAt?: string;
  snoozeCount?: number;
}) {
  const result = await reminderJson<{ reminder: AppReminder }>('/api/contacts?action=reminder-update', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  changed();
  return result;
}
