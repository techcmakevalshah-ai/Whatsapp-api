import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { getFlowluSalesMeta } from '../server/flowluCrm.js';
import { fetchFlowluLossReasons, updateFlowluOpportunity } from '../server/flowluOpportunityControl.js';
import {
  createFlowluOpportunityComment,
  createFlowluPipelineStage,
  createFlowluWorkspaceOpportunity,
  getFlowluOpportunityDetail,
  getFlowluOpportunityWorkspace,
  searchFlowluAccounts,
} from '../server/flowluOpportunityWorkspace.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();

  try {
    if (req.method === 'GET' && action === 'meta') {
      const meta = await getFlowluSalesMeta();
      return res.status(200).json(meta);
    }

    if (req.method === 'GET' && action === 'board') {
      const pipelineId = Number(req.query.pipelineId || 0);
      const assigneeId = Number(req.query.assigneeId || 0) || undefined;
      const sourceId = Number(req.query.sourceId || 0) || undefined;
      const raw = String(req.query.dealStatus || 'all');
      const dealStatus = ['in_progress', 'won', 'lost'].includes(raw)
        ? raw as 'in_progress' | 'won' | 'lost'
        : 'all';
      const result = await getFlowluOpportunityWorkspace({ pipelineId, assigneeId, sourceId, dealStatus });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(result);
    }

    if (req.method === 'GET' && action === 'detail') {
      const leadId = Number(req.query.id || 0);
      const detail = await getFlowluOpportunityDetail(leadId);
      const lossReasons = await fetchFlowluLossReasons();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ...detail, lossReasons });
    }

    if (req.method === 'GET' && action === 'account-search') {
      const accounts = await searchFlowluAccounts(String(req.query.search || ''));
      return res.status(200).json({ accounts });
    }

    if (req.method === 'POST' && action === 'stage-create') {
      const body = req.body || {};
      const stage = await createFlowluPipelineStage({
        pipelineId: Number(body.pipelineId || 0),
        name: String(body.name || ''),
        color: body.color ? String(body.color) : undefined,
      });
      return res.status(201).json({ ok: true, stage });
    }

    if (req.method === 'POST' && action === 'opportunity-create') {
      const body = req.body || {};
      const result = await createFlowluWorkspaceOpportunity({
        name: String(body.name || ''),
        pipelineId: Number(body.pipelineId || 0),
        stageId: Number(body.stageId || 0) || undefined,
        budget: body.budget === '' || body.budget == null ? undefined : Number(body.budget),
        assigneeId: Number(body.assigneeId || 0) || undefined,
        sourceId: Number(body.sourceId || 0) || undefined,
        accountId: Number(body.accountId || 0) || undefined,
      });
      return res.status(201).json({ ok: true, opportunityId: result.id });
    }

    if (req.method === 'POST' && action === 'comment-create') {
      const body = req.body || {};
      const result = await createFlowluOpportunityComment({
        leadId: Number(body.leadId || 0),
        text: String(body.text || ''),
      });
      return res.status(201).json({ ok: true, commentId: result.id });
    }

    if (req.method === 'PATCH' && action === 'opportunity-update') {
      const body = req.body || {};
      const opportunity = await updateFlowluOpportunity({
        id: Number(body.id || 0),
        name: body.name === undefined ? undefined : String(body.name),
        budget: body.budget === undefined || body.budget === '' ? undefined : Number(body.budget),
        pipelineId: body.pipelineId === undefined || body.pipelineId === '' ? undefined : Number(body.pipelineId),
        stageId: body.stageId === undefined || body.stageId === '' ? undefined : Number(body.stageId),
        sourceId: body.sourceId === undefined ? undefined : Number(body.sourceId || 0),
        assigneeId: body.assigneeId === undefined ? undefined : Number(body.assigneeId || 0),
        description: body.description === undefined ? undefined : String(body.description),
        deadline: body.deadline === undefined ? undefined : String(body.deadline),
        action: ['won', 'lost', 'reopen'].includes(String(body.opportunityAction || ''))
          ? String(body.opportunityAction) as 'won' | 'lost' | 'reopen'
          : 'save',
        lossReasonId: body.lossReasonId ? Number(body.lossReasonId) : undefined,
        closingComment: body.closingComment === undefined ? undefined : String(body.closingComment),
      });
      return res.status(200).json({ ok: true, opportunity });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'CRM workspace request failed.';
    const permissionProblem = String(error?.code || '').includes('403') || /permission|insufficient|forbidden/i.test(message);
    return res.status(permissionProblem ? 403 : 400).json({
      error: permissionProblem
        ? 'Flowlu API access was denied. Check the Flowlu API key and CRM permissions.'
        : message,
    });
  }
}
