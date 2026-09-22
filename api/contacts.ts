import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { fetchSheetContacts } from '../server/googleSheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const contacts = await fetchSheetContacts();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ contacts, syncedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read Google Sheet.' });
  }
}
