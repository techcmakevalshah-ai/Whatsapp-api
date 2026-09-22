import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { processCampaignBatch } from '../../server/campaignWorker.js';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

const CAMPAIGN_LIMIT = 5;
const BATCH_SIZE = 20;

function authorized(req: VercelRequest) {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const header = String(req.headers.authorization || '');
  const received = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!expected || !received) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized scheduler request.' });

  const sb = supabaseAdmin();
  const now = new Date().toISOString();

  try {
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
