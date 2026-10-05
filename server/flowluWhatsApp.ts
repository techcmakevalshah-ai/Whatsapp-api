import { decodeSourceCategory } from './contactSources.js';
import { supabaseAdmin } from './supabaseAdmin.js';
import { writeFlowluWhatsAppActivity } from './flowluCrm.js';

export async function writeBackFlowluWhatsAppStatus(input: {
  category: unknown;
  phone: unknown;
  status: 'Read' | 'Failed';
  campaignName: string;
  templateName: string;
  occurredAt: string;
  error?: string | null;
}) {
  const marker = decodeSourceCategory(input.category);
  if (!marker.marked || marker.source !== 'flowlu') return { written: false, reason: 'not_flowlu' };

  const phone = String(input.phone || '').replace(/\D/g, '');
  if (!phone) return { written: false, reason: 'missing_phone' };

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('flowlu_contacts_cache')
      .select('flowlu_id')
      .eq('phone', phone)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const accountId = Number(data?.flowlu_id || 0);
    if (!accountId) return { written: false, reason: 'contact_not_cached' };

    await writeFlowluWhatsAppActivity({
      accountId,
      status: input.status,
      campaignName: input.campaignName,
      templateName: input.templateName,
      occurredAt: input.occurredAt,
      error: input.error,
    });

    return { written: true, accountId };
  } catch (error) {
    console.error('Flowlu WhatsApp activity write-back failed', error);
    return { written: false, reason: 'write_failed' };
  }
}
