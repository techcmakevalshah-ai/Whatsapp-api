import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { fetchSheetContacts } from '../server/googleSheets.js';
import { listTemplates, sendTemplateMessage } from '../server/whatsapp.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

const TEST_CAMPAIGN_NAME = '__officialwa_one_time_test_20260922__';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const sb = supabaseAdmin();

    const { data: existing } = await sb
      .from('campaigns')
      .select('id, status')
      .eq('name', TEST_CAMPAIGN_NAME)
      .maybeSingle();

    if (existing) {
      const { data: recipient } = await sb
        .from('campaign_recipients')
        .select('name, phone, status, provider_message_id, error_message')
        .eq('campaign_id', existing.id)
        .maybeSingle();
      return res.status(200).json({
        alreadySent: true,
        campaignId: existing.id,
        status: recipient?.status || existing.status,
        recipient: recipient ? { name: recipient.name, phoneLast4: String(recipient.phone || '').slice(-4) } : null,
        messageId: recipient?.provider_message_id || null,
        error: recipient?.error_message || null,
      });
    }

    const contacts = await fetchSheetContacts();
    const contact = contacts[0];
    if (!contact) return res.status(400).json({ error: 'No contact found in Google Sheet.' });

    const templates = await listTemplates();
    const template = templates[0];
    if (!template) return res.status(400).json({ error: 'No configured OfficialWA template found.' });

    const params = Array.from({ length: template.variables }, (_, index) =>
      index === 0 ? contact.name : '1234'
    );

    const sent = await sendTemplateMessage({
      phone: contact.phone,
      templateName: template.name,
      language: template.language || 'en',
      params,
      headerType: template.headerType,
    });

    const campaignId = crypto.randomUUID();
    const recipientId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: campaignError } = await sb.from('campaigns').insert({
      id: campaignId,
      name: TEST_CAMPAIGN_NAME,
      template_name: template.name,
      template_language: template.language || 'en',
      status: 'sent',
      scheduled_at: now,
    });
    if (campaignError) throw campaignError;

    const { error: recipientError } = await sb.from('campaign_recipients').insert({
      id: recipientId,
      campaign_id: campaignId,
      name: contact.name,
      phone: contact.phone,
      category: contact.category,
      variables: Object.fromEntries(params.map((value, index) => [String(index + 1), value])),
      status: 'Sent',
      provider_message_id: sent.messageId || null,
      sent_at: now,
    });
    if (recipientError) throw recipientError;

    return res.status(200).json({
      alreadySent: false,
      campaignId,
      status: 'Sent',
      recipient: { name: contact.name, phoneLast4: contact.phone.slice(-4) },
      template: template.name,
      messageId: sent.messageId || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Test send failed.' });
  }
}
