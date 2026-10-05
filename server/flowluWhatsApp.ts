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
  const phone = String(input.phone || '').replace(/\D/g, '');
  if (!phone) return { written: false, reason: 'missing_phone' };

  try {
    const sb = supabaseAdmin();
    let query = sb
      .from('flowlu_contacts_cache')
      .select('flowlu_id, category_name')
      .eq('phone', phone);

    // New campaigns carry an explicit Flowlu source marker. Older recurring/message-series
    // runs may only carry the original category, so fall back safely by matching both
    // mobile number and the Flowlu segment name.
    if (marker.marked) {
      if (marker.source !== 'flowlu') return { written: false, reason: 'not_flowlu' };
    } else {
      const category = String(input.category || '').trim();
      if (!category) return { written: false, reason: 'not_flowlu' };
      query = query.eq('category_name', category);
    }

    const { data, error } = await query
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
