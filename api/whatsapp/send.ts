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
      timezone,
      recurrenceDays,
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

    const timezoneValue = String(timezone || 'UTC').trim() || 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezoneValue }).format(new Date());
    } catch {
      return res.status(400).json({ error: 'Invalid timezone.' });
    }

    if (scheduleDate && scheduleDate.getTime() <= Date.now() + 60_000) {
      return res.status(400).json({ error: 'Scheduled time must be at least 1 minute in the future.' });
    }

    if (scheduleDate && scheduleDate.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Scheduled time cannot be more than 1 year in the future.' });
    }

    const recurringDays = recurrenceDays === undefined || recurrenceDays === null || recurrenceDays === ''
      ? null
      : Number(recurrenceDays);

    if (recurringDays !== null && (!Number.isInteger(recurringDays) || recurringDays < 1 || recurringDays > 90)) {
      return res.status(400).json({ error: 'Daily recurrence must be between 1 and 90 days.' });
    }

    if (recurringDays !== null && !scheduleDate) {
      return res.status(400).json({ error: 'A start date and time is required for a daily recurring campaign.' });
    }

    const shouldQueue = Boolean(scheduleDate);
    const sb = supabaseAdmin();

    if (recurringDays !== null) {
      // Validate dynamic variables against the current selected contacts before saving the series.
      selectedContacts.forEach((contact) => {
        resolveVariableMap(variableValues || {}, contact, template.variables);
      });

      const seriesId = crypto.randomUUID();
      const { error: seriesError } = await sb.from('recurring_campaigns').insert({
        id: seriesId,
        name: String(name).trim().slice(0, 120),
        template_name: template.name,
        template_language: template.language,
        header_type: template.headerType || null,
        media_url: String(mediaUrl || '').trim() || null,
        variable_values: variableValues || {},
        timezone: timezoneValue,
        start_at: scheduleDate!.toISOString(),
        next_run_at: scheduleDate!.toISOString(),
        total_days: recurringDays,
        runs_created: 0,
        status: 'active',
        created_by: user.id === 'local-development' ? null : user.id,
      });

      if (seriesError) throw seriesError;

      const recurringRecipients = selectedContacts.map((contact) => ({
        id: crypto.randomUUID(),
        recurring_campaign_id: seriesId,
        phone: contact.phone,
        initial_name: contact.name,
        initial_category: contact.category,
      }));

      const { error: recurringRecipientsError } = await sb
        .from('recurring_campaign_recipients')
        .insert(recurringRecipients);

      if (recurringRecipientsError) throw recurringRecipientsError;

      return res.status(200).json({
        recurring: true,
        recurringSeriesId: seriesId,
        eligibleCount: selectedContacts.length,
        totalDays: recurringDays,
        nextRunAt: scheduleDate!.toISOString(),
        recipients: selectedContacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          status: 'Queued',
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          error: null,
        })),
      });
    }

    const campaignId = crypto.randomUUID();
    const { error: campaignError } = await sb.from('campaigns').insert({
      id: campaignId,
      name: String(name).trim().slice(0, 120),
      template_name: template.name,
      template_language: template.language,
      header_type: template.headerType || null,
      media_url: String(mediaUrl || '').trim() || null,
      status: shouldQueue ? 'scheduled' : 'sending',
      scheduled_at: shouldQueue ? scheduleDate!.toISOString() : new Date().toISOString(),
      timezone: timezoneValue,
      scheduler_error: null,
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
