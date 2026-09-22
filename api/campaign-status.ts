import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Campaign id required.' });

    const sb = supabaseAdmin();
    const campaignQuery = sb.from('campaigns').select('id, created_by, status').eq('id', id);
    if (user.id !== 'local-development') campaignQuery.eq('created_by', user.id);
    const { data: campaign, error: campaignError } = await campaignQuery.maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

    const { data, error } = await sb
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at');
    if (error) throw error;

    return res.status(200).json({
      campaignStatus: campaign.status,
      recipients: (data || []).map((row: any) => ({
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
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load campaign status.' });
  }
}
