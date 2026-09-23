import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

const ALLOWED_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);
const STATUS_RANK: Record<string, number> = {
  Queued: 0,
  Processing: 1,
  Sent: 2,
  Delivered: 3,
  Read: 4,
  Failed: 5,
};

function isoFromTimestamp(value: unknown) {
  if (value == null) return new Date().toISOString();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const ms = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return new Date().toISOString();
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function normalizeEventName(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/[\s_-]+/g, ' ');
}

function extractPhone(body: any) {
  return firstString(
    body?.phone,
    body?.from,
    body?.to,
    body?.wa_id,
    body?.mobile,
    body?.mobile_no,
    body?.contact?.phone,
    body?.contact?.wa_id,
    body?.data?.phone,
    body?.data?.from,
    body?.data?.to,
    body?.data?.wa_id,
    body?.message?.from,
    body?.message?.to,
    body?.messages?.[0]?.from,
    body?.contacts?.[0]?.wa_id,
  );
}

type StatusCandidate = {
  status: string;
  messageId: string | null;
  timestamp: unknown;
  error: string | null;
};

function collectStatusCandidates(value: unknown, output: StatusCandidate[], depth = 0) {
  if (depth > 8 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) collectStatusCandidates(item, output, depth + 1);
    return;
  }

  if (typeof value !== 'object') return;

  const object = value as Record<string, any>;
  const normalizedStatus = String(
    object.status ?? object.message_status ?? object.delivery_status ?? object.event ?? object.type ?? '',
  ).trim().toLowerCase();

  if (ALLOWED_STATUSES.has(normalizedStatus)) {
    const messageId = firstString(
      object.id,
      object.message_id,
      object.messageId,
      object.msg_id,
      object.wa_message_id,
      object.wamid,
      object.message?.id,
      object.data?.id,
      object.data?.message_id,
      object.data?.messageId,
    );

    const error = firstString(
      object.error,
      object.error_message,
      object.errors?.[0]?.title,
      object.errors?.[0]?.message,
      object.reason,
      object.data?.error,
    );

    output.push({
      status: normalizedStatus,
      messageId,
      timestamp: object.timestamp ?? object.time ?? object.created_at ?? object.updated_at,
      error,
    });
  }

  for (const child of Object.values(object)) {
    if (child && typeof child === 'object') {
      collectStatusCandidates(child, output, depth + 1);
    }
  }
}

async function applyStatus(
  sb: ReturnType<typeof supabaseAdmin>,
  candidate: StatusCandidate,
) {
  if (!candidate.messageId) {
    return { matched: false, note: 'Status event had no message id.' };
  }

  const { data: recipient, error: lookupError } = await sb
    .from('campaign_recipients')
    .select('id, status')
    .eq('provider_message_id', candidate.messageId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!recipient) {
    return { matched: false, note: 'No campaign recipient matched the provider message id.' };
  }

  const currentStatus = String(recipient.status || '');
  const timestamp = isoFromTimestamp(candidate.timestamp);
  const update: Record<string, unknown> = {};

  if (candidate.status === 'sent') {
    if ((STATUS_RANK[currentStatus] ?? 0) <= STATUS_RANK.Sent) {
      update.status = 'Sent';
    }
    update.sent_at = timestamp;
  }

  if (candidate.status === 'delivered') {
    if ((STATUS_RANK[currentStatus] ?? 0) <= STATUS_RANK.Delivered) {
      update.status = 'Delivered';
    }
    update.delivered_at = timestamp;
  }

  if (candidate.status === 'read') {
    update.status = 'Read';
    update.read_at = timestamp;
  }

  if (candidate.status === 'failed') {
    if (!['Delivered', 'Read'].includes(currentStatus)) {
      update.status = 'Failed';
      update.error_message = candidate.error || 'WhatsApp delivery failed';
    }
  }

  if (!Object.keys(update).length) {
    return { matched: true, note: 'Event matched but did not advance status.' };
  }

  const { error: updateError } = await sb
    .from('campaign_recipients')
    .update(update)
    .eq('id', recipient.id);

  if (updateError) throw updateError;
  return { matched: true, note: `Updated recipient to ${String(update.status || currentStatus)}.` };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      process.env.WHATSAPP_VERIFY_TOKEN &&
      token === process.env.WHATSAPP_VERIFY_TOKEN
    ) {
      return res.status(200).send(String(challenge || ''));
    }

    return res.status(200).json({ ok: true, webhook: 'officialwa' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const candidates: StatusCandidate[] = [];
    collectStatusCandidates(body, candidates);

    const eventType = normalizeEventName(
      body?.event ??
      body?.event_type ??
      body?.type ??
      body?.status ??
      body?.action ??
      candidates[0]?.status,
    );

    const providerMessageId =
      candidates.find((item) => item.messageId)?.messageId ??
      firstString(body?.message_id, body?.messageId, body?.id, body?.data?.message_id);

    const phone = extractPhone(body);
    const sb = supabaseAdmin();

    const uniqueCandidates = candidates.filter((candidate, index, all) =>
      all.findIndex((item) =>
        item.status === candidate.status &&
        item.messageId === candidate.messageId
      ) === index
    );

    const processingNotes: string[] = [];
    let processed = false;

    for (const candidate of uniqueCandidates) {
      const result = await applyStatus(sb, candidate);
      processingNotes.push(`${candidate.status}: ${result.note}`);
      processed = processed || result.matched;
    }

    const { error: logError } = await sb
      .from('officialwa_webhook_events')
      .insert({
        id: crypto.randomUUID(),
        event_type: eventType,
        provider_message_id: providerMessageId,
        phone,
        payload: body,
        processed,
        process_note: processingNotes.join(' | ').slice(0, 1500) || 'Captured for payload mapping.',
      });

    if (logError) throw logError;

    return res.status(200).json({
      ok: true,
      received: true,
      statusEventsFound: uniqueCandidates.length,
      matchedExistingMessage: processed,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
}
