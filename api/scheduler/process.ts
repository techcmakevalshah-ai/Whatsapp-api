import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processCampaignBatch } from '../../server/campaignWorker.js';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

const CAMPAIGN_LIMIT = 5;
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
      campaigns: results,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Scheduler failed.',
    });
  }
}
