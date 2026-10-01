import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../../server/auth.js';
import { createFlowluContactNote } from '../../server/flowluCrm.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const result = await createFlowluContactNote({
      accountId: Number(body.accountId || 0),
      text: String(body.text || ''),
    });

    return res.status(201).json({ ok: true, noteId: result.id });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Unable to add Flowlu CRM note.',
    });
  }
}
