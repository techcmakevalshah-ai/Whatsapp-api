import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processCampaignBatch } from '../../server/campaignWorker.js';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sb = supabaseAdmin();
    const now = new Date().toISOString();
    const { data: campaigns, error } = await sb
      .from('campaigns')
      .select('id')
      .in('status', ['scheduled', 'sending'])
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10);
    if (error) throw error;

    let processed = 0;
    for (const campaign of campaigns || []) {
      const results = await processCampaignBatch(campaign.id, 25);
      processed += results.length;
    }

    return res.status(200).json({ ok: true, processed });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Scheduled worker failed.' });
  }
}
