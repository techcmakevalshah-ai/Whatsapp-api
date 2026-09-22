import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { processCampaignBatch } from '../../server/campaignWorker.js';
import { fetchSheetContacts } from '../../server/googleSheets.js';
import { resolveVariableMap } from '../../server/templateValues.js';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

const CAMPAIGN_LIMIT = 5;
const RECURRING_LIMIT = 3;
const BATCH_SIZE = 20;

async function authorized(req: VercelRequest) {
  const candidate = String(req.headers['x-scheduler-token'] || '').trim();
  if (!candidate) return false;

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('scheduler_token_matches', { candidate });
  if (error) throw error;
  return data === true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!(await authorized(req))) {
      return res.status(401).json({ error: 'Unauthorized scheduler request.' });
    }

    const sb = supabaseAdmin();
    const now = new Date().toISOString();
    const recurringResults: Array<Record<string, unknown>> = [];

    const { data: claimedSeries, error: recurringClaimError } = await sb.rpc(
      'claim_due_recurring_campaigns',
      { p_limit: RECURRING_LIMIT },
    );
    if (recurringClaimError) throw recurringClaimError;

    let liveContacts: Awaited<ReturnType<typeof fetchSheetContacts>> | null = null;

    for (const series of claimedSeries || []) {
      try {
        const runIndex = Number(series.runs_created || 0) + 1;
        const scheduledAt = String(series.next_run_at || '');
        if (!scheduledAt) throw new Error('Recurring campaign has no next run time.');

        const { data: members, error: membersError } = await sb
          .from('recurring_campaign_recipients')
          .select('phone')
          .eq('recurring_campaign_id', series.id);

        if (membersError) throw membersError;

        if (!liveContacts) liveContacts = await fetchSheetContacts();
        const allowedPhones = new Set((members || []).map((row: any) => String(row.phone)));
        const activeContacts = liveContacts.filter(
          (contact) => contact.status === 'Active' && allowedPhones.has(contact.phone),
        );

        let { data: campaign, error: existingError } = await sb
          .from('campaigns')
          .select('id, status')
          .eq('recurring_series_id', series.id)
          .eq('recurrence_index', runIndex)
          .maybeSingle();

        if (existingError) throw existingError;

        if (!campaign) {
          const campaignId = crypto.randomUUID();
          const { data: inserted, error: insertError } = await sb
            .from('campaigns')
            .insert({
              id: campaignId,
              name: `${series.name} · Day ${runIndex}/${series.total_days}`,
              template_name: series.template_name,
              template_language: series.template_language,
              header_type: series.header_type || null,
              media_url: series.media_url || null,
              status: activeContacts.length ? 'sending' : 'skipped_no_active_contacts',
              scheduled_at: scheduledAt,
              timezone: series.timezone || 'UTC',
              recurring_series_id: series.id,
              recurrence_index: runIndex,
              created_by: series.created_by || null,
              scheduler_error: null,
            })
            .select('id, status')
            .single();

          if (insertError) throw insertError;
          campaign = inserted;
        }

        if (activeContacts.length) {
          const rows = activeContacts.map((contact) => ({
            id: crypto.randomUUID(),
            campaign_id: campaign.id,
            name: contact.name,
            phone: contact.phone,
            category: contact.category,
            status: 'Queued',
            variables: resolveVariableMap(
              (series.variable_values || {}) as Record<string, string>,
              contact,
              Number(series.variable_count || 0),
            ),
          }));

          const { error: recipientsError } = await sb
            .from('campaign_recipients')
            .upsert(rows, { onConflict: 'campaign_id,phone', ignoreDuplicates: true });

          if (recipientsError) throw recipientsError;

          await sb
            .from('campaigns')
            .update({ status: 'sending', scheduler_error: null })
            .eq('id', campaign.id);
        }

        const { error: advanceError } = await sb.rpc('advance_recurring_campaign', {
          p_series_id: series.id,
          p_expected_next_run: scheduledAt,
        });
        if (advanceError) throw advanceError;

        recurringResults.push({
          recurringSeriesId: series.id,
          campaignId: campaign.id,
          runIndex,
          activeRecipients: activeContacts.length,
          ok: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recurring campaign processing failed.';
        await sb.rpc('unlock_recurring_campaign', {
          p_series_id: series.id,
          p_error: message,
        });

        recurringResults.push({
          recurringSeriesId: series.id,
          ok: false,
          error: message,
        });
      }
    }

    const { data: campaigns, error } = await sb
      .from('campaigns')
      .select('id, name, status, scheduled_at')
      .in('status', ['scheduled', 'sending'])
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(CAMPAIGN_LIMIT);

    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];

    for (const campaign of campaigns || []) {
      try {
        const batch = await processCampaignBatch(campaign.id, BATCH_SIZE);

        await sb
          .from('campaigns')
          .update({
            last_scheduler_run_at: new Date().toISOString(),
            scheduler_error: null,
          })
          .eq('id', campaign.id);

        results.push({
          campaignId: campaign.id,
          name: campaign.name,
          processed: batch.length,
          ok: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduled campaign processing failed.';

        await sb
          .from('campaigns')
          .update({
            last_scheduler_run_at: new Date().toISOString(),
            scheduler_error: message,
          })
          .eq('id', campaign.id);

        results.push({
          campaignId: campaign.id,
          name: campaign.name,
          processed: 0,
          ok: false,
          error: message,
        });
      }
    }

    return res.status(200).json({
      checkedAt: now,
      recurringCampaigns: recurringResults,
      campaigns: results,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Scheduler failed.',
    });
  }
}
