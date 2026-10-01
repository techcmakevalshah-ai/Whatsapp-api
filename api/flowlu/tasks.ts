import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../../server/auth.js';
import { createFlowluFollowupTask } from '../../server/flowluCrm.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const result = await createFlowluFollowupTask({
      accountId: Number(body.accountId || 0),
      name: String(body.name || ''),
      responsibleId: Number(body.responsibleId || 0),
      deadline: body.deadline ? String(body.deadline) : undefined,
      description: body.description ? String(body.description) : undefined,
    });

    return res.status(201).json({ ok: true, taskId: result.id });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Unable to create Flowlu follow-up task.',
    });
  }
}
