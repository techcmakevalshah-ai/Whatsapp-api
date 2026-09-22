import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { requireStaff } from '../../server/auth.js';
import { processCampaignBatch } from '../../server/campaignWorker.js';
import { fetchSheetContacts } from '../../server/googleSheets.js';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';
import { resolveVariableMap } from '../../server/templateValues.js';
import { listTemplates } from '../../server/whatsapp.js';

const MAX_CAMPAIGN_RECIPIENTS = 1000;
const IMMEDIATE_BATCH_SIZE = 20;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const {
      name,
      templateName,
      templateLanguage,
      contactIds,
      variableValues,
      scheduledAt,
      mediaUrl,
    } = req.body || {};

    if (!String(name || '').trim() || !templateName || !Array.isArray(contactIds) || !contactIds.length) {
      return res.status(400).json({ error: 'Campaign name, template and contacts are required.' });
    }
    if (contactIds.length > MAX_CAMPAIGN_RECIPIENTS) {
      return res.status(400).json({ error: `A campaign can contain at most ${MAX_CAMPAIGN_RECIPIENTS} contacts.` });
    }

    const approvedTemplates = await listTemplates();
    const template = approvedTemplates.find(
      (item) => item.name === templateName && item.language === (templateLanguage || item.language),
    );
    if (!template || template.status !== 'APPROVED') {
      return res.status(400).json({ error: 'The selected WhatsApp template is not approved or no longer exists.' });
    }
    if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) && !String(mediaUrl || '').trim()) {
      return res.status(400).json({ error: `${template.headerType.toLowerCase()} template requires a public media URL.` });
    }

    const liveContacts = await fetchSheetContacts();
    const requestedIds = new Set(contactIds.map(String));
    const selectedContacts = liveContacts.filter(
      (contact) => requestedIds.has(contact.id) && contact.status === 'Active',
    );
    if (!selectedContacts.length) {
      return res.status(400).json({ error: 'None of the selected contacts are currently active.' });
    }
    if (selectedContacts.length !== requestedIds.size) {
      return res.status(400).json({
        error: 'One or more selected contacts changed or are no longer eligible. Refresh contacts and try again.',
      });
    }

    const scheduleDate = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduleDate && Number.isNaN(scheduleDate.getTime())) {
      return res.status(400).json({ error: 'Invalid campaign schedule.' });
    }
    const shouldQueue = Boolean(scheduleDate && scheduleDate.getTime() > Date.now() + 30_000);

    const campaignId = crypto.randomUUID();
    const sb = supabaseAdmin();
    const { error: campaignError } = await sb.from('campaigns').insert({
      id: campaignId,
      name: String(name).trim().slice(0, 120),
      template_name: template.name,
      template_language: template.language,
      header_type: template.headerType || null,
      media_url: String(mediaUrl || '').trim() || null,
      status: shouldQueue ? 'scheduled' : 'sending',
      scheduled_at: shouldQueue ? scheduleDate!.toISOString() : new Date().toISOString(),
      created_by: user.id === 'local-development' ? null : user.id,
    });
    if (campaignError) throw campaignError;

    const rows = selectedContacts.map((contact) => ({
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      name: contact.name,
      phone: contact.phone,
      category: contact.category,
      status: 'Queued',
      variables: resolveVariableMap(variableValues || {}, contact, template.variables),
    }));
    const { error: recipientsError } = await sb.from('campaign_recipients').insert(rows);
    if (recipientsError) throw recipientsError;

    if (!shouldQueue) await processCampaignBatch(campaignId, IMMEDIATE_BATCH_SIZE);

    const { data: recipients, error: statusError } = await sb
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at');
    if (statusError) throw statusError;

    return res.status(200).json({
      campaignId,
      eligibleCount: selectedContacts.length,
      recipients: (recipients || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        status: row.status,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
        error: row.error_message,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create campaign.' });
  }
}
