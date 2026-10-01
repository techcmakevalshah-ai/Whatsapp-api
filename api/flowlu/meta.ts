import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../../server/auth.js';
import { getFlowluSalesMeta } from '../../server/flowluCrm.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const meta = await getFlowluSalesMeta();
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(meta);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load Flowlu sales setup.' });
  }
}
