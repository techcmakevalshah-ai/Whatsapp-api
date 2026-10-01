import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../../server/auth.js';
import { createFlowluOpportunity } from '../../server/flowluCrm.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const result = await createFlowluOpportunity({
      accountId: Number(body.accountId || 0),
      name: String(body.name || ''),
      budget: body.budget === '' || body.budget == null ? undefined : Number(body.budget),
      pipelineId: Number(body.pipelineId || 0),
      stageId: body.stageId ? Number(body.stageId) : undefined,
      sourceId: body.sourceId ? Number(body.sourceId) : undefined,
      assigneeId: body.assigneeId ? Number(body.assigneeId) : undefined,
    });
    return res.status(201).json({ ok: true, opportunityId: result.id });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create Flowlu opportunity.' });
  }
}
