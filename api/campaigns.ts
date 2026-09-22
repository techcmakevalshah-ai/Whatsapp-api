import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const sb = supabaseAdmin();
    let query = sb
      .from('campaigns')
      .select('id, name, template_name, status, scheduled_at, created_at, campaign_recipients(count)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (user.id !== 'local-development') query = query.eq('created_by', user.id);
    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      campaigns: (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        templateName: row.template_name,
        status: row.status,
        scheduledAt: row.scheduled_at,
        createdAt: row.created_at,
        totalRecipients: row.campaign_recipients?.[0]?.count || 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load campaigns.' });
  }
}
