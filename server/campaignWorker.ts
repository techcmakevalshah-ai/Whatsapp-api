import { supabaseAdmin } from './supabaseAdmin.js';
import { sendTemplateMessage } from './whatsapp.js';

export async function processCampaignBatch(campaignId: string, limit = 20) {
  const sb = supabaseAdmin();
  const { data: campaign, error: campaignError } = await sb
    .from('campaigns')
    .select('id, template_name, template_language, header_type, media_url')
    .eq('id', campaignId)
    .single();
  if (campaignError) throw campaignError;

  const { data: rows, error: rowsError } = await sb
    .from('campaign_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'Queued')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (rowsError) throw rowsError;

  const results: any[] = [];
  for (const row of rows || []) {
    const { data: claimed, error: claimError } = await sb
      .from('campaign_recipients')
      .update({ status: 'Processing' })
      .eq('id', row.id)
      .eq('status', 'Queued')
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const values = (row.variables || {}) as Record<string, string>;
      const params = Object.keys(values)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => String(values[key] || ''));
      const sent = await sendTemplateMessage({
        phone: row.phone,
        templateName: campaign.template_name,
        language: campaign.template_language || 'en_US',
        params,
        headerType: campaign.header_type,
        mediaUrl: campaign.media_url,
      });
      const sentAt = new Date().toISOString();
      const { error } = await sb
        .from('campaign_recipients')
        .update({
          status: 'Sent',
          provider_message_id: sent.messageId,
          sent_at: sentAt,
          error_message: null,
        })
        .eq('id', row.id);
      if (error) throw error;
      results.push({ id: row.id, name: row.name, phone: row.phone, status: 'Sent', sentAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed';
      await sb
        .from('campaign_recipients')
        .update({ status: 'Failed', error_message: message })
        .eq('id', row.id);
      results.push({ id: row.id, name: row.name, phone: row.phone, status: 'Failed', error: message });
    }
  }

  const { count: queuedCount } = await sb
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['Queued', 'Processing']);

  if ((queuedCount || 0) === 0) {
    const { count: failedCount } = await sb
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'Failed');
    await sb
      .from('campaigns')
      .update({ status: failedCount ? 'sent_with_errors' : 'sent' })
      .eq('id', campaignId);
  } else {
    await sb.from('campaigns').update({ status: 'sending' }).eq('id', campaignId);
  }

  return results;
}
