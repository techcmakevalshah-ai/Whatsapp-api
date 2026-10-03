import { supabaseAdmin } from './supabaseAdmin.js';
import {
  type FlowluContact,
} from './flowluContacts.js';
import { fetchAllFlowluContactsReliable } from './flowluReliableSync.js';

function cacheMissing(error: any) {
  const text = String(error?.message || error?.code || error || '');
  return /flowlu_contacts_cache|flowlu_sync_state|PGRST205|42P01|schema cache/i.test(text);
}

function rowToContact(row: any): FlowluContact {
  return {
    id: 'flowlu:' + row.flowlu_id,
    flowluId: Number(row.flowlu_id),
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    category: String(row.category_name || 'Flowlu CRM'),
    categoryId: Number(row.category_id || 0) || null,
    status: row.active === false ? 'Inactive' : 'Active',
    source: 'flowlu',
    email: row.email || null,
    description: row.description || null,
    address: row.address || null,
    ownerId: Number(row.owner_id || 0) || null,
    sourceUpdatedAt: row.source_updated_at || null,
  };
}

function contactToRow(contact: FlowluContact) {
  return {
    flowlu_id: contact.flowluId,
    name: contact.name,
    first_name: null,
    last_name: null,
    phone: contact.phone,
    email: contact.email || null,
    category_id: contact.categoryId || null,
    category_name: contact.category || 'Flowlu CRM',
    owner_id: contact.ownerId || null,
    active: contact.status === 'Active',
    description: contact.description || null,
    address: contact.address || null,
    raw: {},
    source_updated_at: contact.sourceUpdatedAt || null,
    synced_at: new Date().toISOString(),
  };
}

export async function readFlowluContactCache(): Promise<{ contacts: FlowluContact[]; syncedAt: string | null } | null> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('flowlu_contacts_cache')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;

    const contacts = (data || []).map(rowToContact);
    const syncedAt = (data || []).reduce<string | null>((latest, row: any) => {
      const value = String(row.synced_at || '');
      return !latest || value > latest ? value : latest;
    }, null);

    return { contacts, syncedAt };
  } catch (error) {
    if (cacheMissing(error)) return null;
    throw error;
  }
}

export async function upsertFlowluContactCache(contact: FlowluContact): Promise<boolean> {
  try {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from('flowlu_contacts_cache')
      .upsert(contactToRow(contact), { onConflict: 'flowlu_id' });
    if (error) throw error;
    return true;
  } catch (error) {
    if (cacheMissing(error)) return false;
    throw error;
  }
}

export async function deleteFlowluContactCache(flowluId: number): Promise<boolean> {
  try {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from('flowlu_contacts_cache')
      .delete()
      .eq('flowlu_id', flowluId);
    if (error) throw error;
    return true;
  } catch (error) {
    if (cacheMissing(error)) return false;
    throw error;
  }
}

async function updateSyncState(input: {
  fullSync?: boolean;
  webhook?: boolean;
  error?: string | null;
  recordsCount?: number;
}) {
  try {
    const sb = supabaseAdmin();
    const now = new Date().toISOString();
    const payload: any = {
      scope: 'contacts',
      last_error: input.error || null,
      updated_at: now,
    };
    if (input.fullSync) payload.last_full_sync_at = now;
    if (input.webhook) payload.last_webhook_at = now;
    if (typeof input.recordsCount === 'number') payload.records_count = input.recordsCount;
    const { error } = await sb.from('flowlu_sync_state').upsert(payload, { onConflict: 'scope' });
    if (error) throw error;
  } catch (error) {
    if (!cacheMissing(error)) console.error('Flowlu sync state update failed', error);
  }
}

export async function syncFlowluContactsToCache(): Promise<{ contacts: FlowluContact[]; cacheEnabled: boolean; syncedAt: string }> {
  try {
    const contacts = await fetchAllFlowluContactsReliable();
    let cacheEnabled = true;

    try {
      const sb = supabaseAdmin();
      const rows = contacts.map(contactToRow);
      const { error } = await sb
        .from('flowlu_contacts_cache')
        .upsert(rows, { onConflict: 'flowlu_id' });
      if (error) throw error;
    } catch (error) {
      if (cacheMissing(error)) cacheEnabled = false;
      else throw error;
    }

    await updateSyncState({ fullSync: true, error: null, recordsCount: contacts.length });
    return { contacts, cacheEnabled, syncedAt: new Date().toISOString() };
  } catch (error) {
    await updateSyncState({ fullSync: true, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function getFlowluContactsSmart(force = false): Promise<{
  contacts: FlowluContact[];
  syncedAt: string;
  syncMode: 'cache' | 'live';
  cacheEnabled: boolean;
}> {
  if (!force) {
    const cached = await readFlowluContactCache();
    if (cached && cached.contacts.length) {
      return {
        contacts: cached.contacts,
        syncedAt: cached.syncedAt || new Date().toISOString(),
        syncMode: 'cache',
        cacheEnabled: true,
      };
    }
  }

  const live = await syncFlowluContactsToCache();
  return {
    contacts: live.contacts,
    syncedAt: live.syncedAt,
    syncMode: 'live',
    cacheEnabled: live.cacheEnabled,
  };
}

export async function recordFlowluWebhookSuccess(recordsCount?: number) {
  await updateSyncState({ webhook: true, error: null, recordsCount });
}
