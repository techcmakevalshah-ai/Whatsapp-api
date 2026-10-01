import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteFlowluContactCache, recordFlowluWebhookSuccess, upsertFlowluContactCache } from '../../server/flowluCache.js';
import { fetchFlowluContactById, invalidateFlowluMemoryCache } from '../../server/flowluContacts.js';

function extractId(body: any) {
  const candidates = [
    body?.id,
    body?.entity_id,
    body?.record_id,
    body?.account_id,
    body?.data?.id,
    body?.data?.account_id,
    body?.record?.id,
    body?.entity?.id,
    body?.object?.id,
    body?.payload?.id,
  ];
  for (const value of candidates) {
    const id = Number(value || 0);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return 0;
}

function eventAction(body: any) {
  return String(
    body?.action ||
    body?.event?.action ||
    body?.event_action ||
    body?.type ||
    body?.event ||
    '',
  ).toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const configuredSecret = String(process.env.FLOWLU_WEBHOOK_SECRET || '').trim();
  if (!configuredSecret) {
    return res.status(503).json({ error: 'FLOWLU_WEBHOOK_SECRET is not configured.' });
  }

  const providedSecret = String(req.query.secret || req.headers['x-flowlu-webhook-secret'] || '').trim();
  if (!providedSecret || providedSecret !== configuredSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret.' });
  }

  const body = req.body || {};
  const flowluId = extractId(body);
  if (!flowluId) {
    return res.status(202).json({ ok: true, ignored: true, reason: 'No CRM account id found in webhook payload.' });
  }

  try {
    const action = eventAction(body);
    invalidateFlowluMemoryCache();

    if (action.includes('delete')) {
      const cached = await deleteFlowluContactCache(flowluId);
      await recordFlowluWebhookSuccess();
      return res.status(cached ? 200 : 503).json({
        ok: cached,
        action: 'delete',
        flowluId,
        cacheEnabled: cached,
      });
    }

    const contact = await fetchFlowluContactById(flowluId);
    if (!contact) {
      return res.status(202).json({ ok: true, ignored: true, reason: 'Flowlu record is not an eligible contact.' });
    }

    const cached = await upsertFlowluContactCache(contact);
    await recordFlowluWebhookSuccess();

    return res.status(cached ? 200 : 503).json({
      ok: cached,
      action: action || 'update',
      flowluId,
      cacheEnabled: cached,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to process Flowlu webhook.',
    });
  }
}
