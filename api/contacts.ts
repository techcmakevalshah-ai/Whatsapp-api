import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { addSheetContact, fetchSheetContacts, setSheetContactStatus } from '../server/googleSheets.js';
import { fetchContactsForSource, normalizeContactSource } from '../server/contactSources.js';
import { handleReminderRequest } from '../server/reminders.js';
import {
  createFlowluContact,
  fetchFlowluCategories,
  fetchFlowluContactById,
  invalidateFlowluMemoryCache,
} from '../server/flowluContacts.js';
import { fetchFlowluContactsByCategory } from '../server/flowluCategoryContacts.js';
import {
  deleteFlowluContactCache,
  recordFlowluWebhookSuccess,
  upsertFlowluContactCache,
  upsertFlowluContactsCache,
} from '../server/flowluCache.js';
import {
  createFlowluContactNote,
  createFlowluFollowupTask,
  createFlowluOpportunity,
  getFlowluOpportunityAudience,
  getFlowluSalesMeta,
} from '../server/flowluCrm.js';

function extractFlowluWebhookId(body: any) {
  const candidates = [
    body?.current?.id,
    body?.previous?.id,
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

function flowluWebhookAction(body: any) {
  return String(
    body?.meta?.action ||
    body?.action ||
    body?.event?.action ||
    body?.event_action ||
    body?.type ||
    body?.event ||
    '',
  ).toLowerCase();
}

function cookieValue(req: VercelRequest, name: string) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const item of cookies) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

async function handleFlowluWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const configuredSecret = String(process.env.FLOWLU_WEBHOOK_SECRET || '').trim();
  if (!configuredSecret) {
    return res.status(503).json({ error: 'FLOWLU_WEBHOOK_SECRET is not configured.' });
  }

  const providedSecret = String(
    req.query.secret ||
    req.headers['x-flowlu-webhook-secret'] ||
    '',
  ).trim();

  if (!providedSecret || providedSecret !== configuredSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret.' });
  }

  const body = req.body || {};
  const flowluId = extractFlowluWebhookId(body);
  if (!flowluId) {
    return res.status(202).json({
      ok: true,
      ignored: true,
      reason: 'No CRM account id found in webhook payload.',
    });
  }

  try {
    const action = flowluWebhookAction(body);
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
      return res.status(202).json({
        ok: true,
        ignored: true,
        reason: 'Flowlu record is not an eligible contact.',
      });
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (String(req.query.flowluWebhook || '') === '1') {
    return handleFlowluWebhook(req, res);
  }

  const user = await requireStaff(req, res);
  if (!user) return;

  const source = normalizeContactSource(req.query.source || req.body?.source);
  const action = String(req.query.action || req.body?.action || '').trim().toLowerCase();

  if (action === 'reminders' || action.startsWith('reminder-')) {
    return handleReminderRequest(req, res, user, action);
  }

  try {
    if (req.method === 'GET' && action === 'flowlu-meta') {
      const meta = await getFlowluSalesMeta();
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.status(200).json(meta);
    }

    if (req.method === 'GET' && action === 'flowlu-opportunity-audience') {
      const pipelineId = Number(req.query.pipelineId || 0);
      const stageId = Number(req.query.stageId || 0) || undefined;
      const audience = await getFlowluOpportunityAudience({ pipelineId, stageId });
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.status(200).json(audience);
    }

    if (req.method === 'GET' && action === 'flowlu-categories') {
      const categories = (await fetchFlowluCategories())
        .filter((category) => category.active)
        .sort((a, b) => a.name.localeCompare(b.name));
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.status(200).json({ categories });
    }

    if (req.method === 'POST' && action === 'flowlu-opportunity') {
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
    }

    if (req.method === 'POST' && action === 'flowlu-task') {
      const body = req.body || {};
      const result = await createFlowluFollowupTask({
        accountId: Number(body.accountId || 0),
        name: String(body.name || ''),
        responsibleId: Number(body.responsibleId || 0),
        deadline: body.deadline ? String(body.deadline) : undefined,
        description: body.description ? String(body.description) : undefined,
      });
      return res.status(201).json({ ok: true, taskId: result.id });
    }

    if (req.method === 'POST' && action === 'flowlu-note') {
      const body = req.body || {};
      const result = await createFlowluContactNote({
        accountId: Number(body.accountId || 0),
        text: String(body.text || ''),
      });
      return res.status(201).json({ ok: true, noteId: result.id });
    }

    if (req.method === 'GET') {
      if (source === 'flowlu') {
        const categoryRaw = String(
          req.query.categoryId || cookieValue(req, 'flowlu_category_id') || '',
        ).trim();

        if (!categoryRaw) {
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json({
            contacts: [],
            source,
            syncedAt: '',
            awaitingCategory: true,
            message: 'Choose a Flowlu segment to load contacts.',
          });
        }

        const categoryId = Number(categoryRaw);
        if (!Number.isFinite(categoryId) || categoryId < 0) {
          return res.status(400).json({ error: 'Choose a valid Flowlu segment.' });
        }

        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(200, Math.max(1, Number(req.query.limit || 200)));
        const search = String(req.query.search || '').trim();
        const force = String(req.query.force || '') === '1';
        const result = await fetchFlowluContactsByCategory({
          categoryId,
          page,
          limit,
          search,
          force,
        });

        const cacheEnabled = await upsertFlowluContactsCache(result.contacts);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          contacts: result.contacts,
          source,
          syncedAt: new Date().toISOString(),
          syncMode: 'category',
          cacheEnabled,
          categoryId,
          total: result.total,
          page: result.page,
          count: result.count,
        });
      }

      const contacts = await fetchContactsForSource(source);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ contacts, source, syncedAt: new Date().toISOString() });
    }

    if (req.method === 'POST') {
      const { name, phone, category, status } = req.body || {};

      if (source === 'flowlu') {
        const contact = await createFlowluContact({
          name: String(name || ''),
          phone: String(phone || ''),
          category: String(category || ''),
          status: status === 'Inactive' ? 'Inactive' : 'Active',
        });

        await upsertFlowluContactCache(contact);
        const selectedCategoryId = Number(cookieValue(req, 'flowlu_category_id') || -1);
        let contacts = [contact];

        if (contact.categoryId != null && contact.categoryId === selectedCategoryId) {
          contacts = (await fetchFlowluContactsByCategory({
            categoryId: selectedCategoryId,
            force: true,
          })).contacts;
          await upsertFlowluContactsCache(contacts);
        }

        return res.status(201).json({
          contact,
          contacts,
          source,
          syncedAt: new Date().toISOString(),
        });
      }

      const contact = await addSheetContact({
        name: String(name || ''),
        phone: String(phone || ''),
        category: String(category || 'Contact'),
        status: status === 'Inactive' ? 'Inactive' : 'Active',
      });

      const contacts = await fetchSheetContacts();
      return res.status(201).json({
        contact,
        contacts,
        source,
        syncedAt: new Date().toISOString(),
      });
    }

    if (req.method === 'PATCH') {
      if (source === 'flowlu') {
        return res.status(405).json({
          error: 'Flowlu contact editing is not enabled yet. Edit existing contacts in Flowlu and refresh here.',
        });
      }

      const id = String(req.query.id || req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'Contact id is required.' });

      const status = req.body?.status === 'Inactive' ? 'Inactive' : 'Active';
      const contact = await setSheetContactStatus(id, status);
      const contacts = await fetchSheetContacts();

      return res.status(200).json({
        contact,
        contacts,
        syncedAt: new Date().toISOString(),
      });
    }

    if (req.method === 'DELETE') {
      return res.status(405).json({
        error: 'Permanent contact deletion is disabled for security. Set the contact to Inactive instead.',
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Unable to load or update contacts.';
    const permissionProblem =
      String(error?.code || '').includes('403') ||
      /permission|insufficient|forbidden/i.test(message);
    const duplicateProblem = /already exists with this mobile number/i.test(message);

    return res.status(
      duplicateProblem ? 409 :
      permissionProblem ? 403 :
      action.startsWith('flowlu-') ? 400 :
      500,
    ).json({
      error: permissionProblem
        ? source === 'flowlu' || action.startsWith('flowlu-')
          ? 'Flowlu API access was denied. Check the Flowlu API key and CRM permissions.'
          : 'Google Sheet write access is blocked for the server service account.'
        : message,
    });
  }
}
