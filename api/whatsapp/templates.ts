import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../../server/auth.js';
import { listTemplates } from '../../server/whatsapp.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const templates = await listTemplates();
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ templates });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load templates.' });
  }
}
