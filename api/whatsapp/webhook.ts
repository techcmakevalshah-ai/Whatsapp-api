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

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function parseCallbackData(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

type StatusCandidate = {
  status: string;
  messageId: string | null;
  recipientId: string | null;
  templateName: string | null;
  timestamp: unknown;
  error: string | null;
};

function collectMetaStatusCandidates(body: any) {
  const output: StatusCandidate[] = [];

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const status of change?.value?.statuses || []) {
        const normalizedStatus = String(status?.status || '').trim().toLowerCase();
        if (!ALLOWED_STATUSES.has(normalizedStatus)) continue;

        const callbackData = parseCallbackData(status?.biz_opaque_callback_data);
        output.push({
          status: normalizedStatus,
          messageId: firstString(status?.id),
          recipientId: firstString(status?.recipient_id, change?.value?.contacts?.[0]?.wa_id),
          templateName: firstString(callbackData?.template),
          timestamp: status?.timestamp,
          error: firstString(
            status?.errors?.[0]?.title,
            status?.errors?.[0]?.message,
            status?.error,
          ),
        });
      }
    }
  }

  return output;
}

async function findRecipientByMessageId(
  sb: ReturnType<typeof supabaseAdmin>,
  messageId: string,
) {
  const { data, error } = await sb
    .from('campaign_recipients')
    .select('id, status, provider_message_id, sent_at')
    .eq('provider_message_id', messageId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findRecentRecipientFallback(
  sb: ReturnType<typeof supabaseAdmin>,
  candidate: StatusCandidate,
) {
  const phone = normalizePhone(candidate.recipientId);
  if (!phone) return null;

  const eventAt = new Date(isoFromTimestamp(candidate.timestamp));
  const earliest = new Date(eventAt.getTime() - 6 * 60 * 60 * 1000).toISOString();

  let query = sb
    .from('campaign_recipients')
    .select('id, status, provider_message_id, sent_at, campaign:campaigns!inner(template_name)')
    .eq('phone', phone)
    .is('provider_message_id', null)
    .not('sent_at', 'is', null)
    .gte('sent_at', earliest)
    .lte('sent_at', eventAt.toISOString())
    .order('sent_at', { ascending: false })
    .limit(5);

  if (candidate.templateName) {
    query = query.eq('campaign.template_name', candidate.templateName);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data?.[0] || null;
}

async function applyStatus(
  sb: ReturnType<typeof supabaseAdmin>,
  candidate: StatusCandidate,
) {
  if (!candidate.messageId) {
    return { matched: false, note: 'Status event had no message id.' };
  }

  let recipient = await findRecipientByMessageId(sb, candidate.messageId);
  let linkedByFallback = false;

  if (!recipient) {
    recipient = await findRecentRecipientFallback(sb, candidate);
    linkedByFallback = Boolean(recipient);
  }

  if (!recipient) {
    return {
      matched: false,
      note: 'No campaign recipient matched message id or recent phone/template fallback.',
    };
  }

  const currentStatus = String(recipient.status || '');
  const timestamp = isoFromTimestamp(candidate.timestamp);
  const update: Record<string, unknown> = {};

  if (!recipient.provider_message_id) {
    update.provider_message_id = candidate.messageId;
  }

  if (candidate.status === 'sent') {
    if ((STATUS_RANK[currentStatus] ?? 0) <= STATUS_RANK.Sent) update.status = 'Sent';
    update.sent_at = recipient.sent_at || timestamp;
  }

  if (candidate.status === 'delivered') {
    if ((STATUS_RANK[currentStatus] ?? 0) <= STATUS_RANK.Delivered) update.status = 'Delivered';
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

  const { error: updateError } = await sb
    .from('campaign_recipients')
    .update(update)
    .eq('id', recipient.id);

  if (updateError) throw updateError;

  return {
    matched: true,
    note: `${linkedByFallback ? 'Linked wamid using phone/template/time fallback. ' : ''}Updated recipient to ${String(update.status || currentStatus)}.`,
  };
}


function extractVerificationChallenge(req: VercelRequest) {
  const direct = firstString(
    req.query['hub.challenge'],
    req.query.challenge,
    req.query['challenge_token'],
    req.query['verify_challenge'],
    req.query['verify.challenge'],
  );
  if (direct) return direct;

  const body = req.body;
  if (body && typeof body === 'object') {
    const object = body as Record<string, unknown>;
    const bodyDirect = firstString(
      object['hub.challenge'],
      object.challenge,
      object.challenge_token,
      object.verify_challenge,
      (object.data as any)?.challenge,
      (object.verification as any)?.challenge,
    );
    if (bodyDirect) return bodyDirect;

    for (const [key, value] of Object.entries(object)) {
      if (key.toLowerCase().includes('challenge')) {
        const found = firstString(value);
        if (found) return found;
      }
    }
  }

  if (typeof body === 'string' && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      const found = firstString(
        parsed?.['hub.challenge'],
        parsed?.challenge,
        parsed?.challenge_token,
        parsed?.verify_challenge,
        parsed?.data?.challenge,
      );
      if (found) return found;
    } catch {
      const params = new URLSearchParams(body);
      const found = firstString(
        params.get('hub.challenge'),
        params.get('challenge'),
        params.get('challenge_token'),
        params.get('verify_challenge'),
      );
      if (found) return found;
    }
  }

  return null;
}

async function logVerificationAttempt(req: VercelRequest, challenge: string | null) {
  try {
    const safeHeaders = {
      'content-type': firstString(req.headers['content-type']),
      'user-agent': firstString(req.headers['user-agent']),
      'x-forwarded-proto': firstString(req.headers['x-forwarded-proto']),
      'x-vercel-id': firstString(req.headers['x-vercel-id']),
    };

    await supabaseAdmin()
      .from('officialwa_webhook_events')
      .insert({
        id: crypto.randomUUID(),
        event_type: 'verification_attempt',
        provider_message_id: null,
        phone: null,
        payload: {
          method: req.method,
          query: req.query,
          body: req.body ?? null,
          headers: safeHeaders,
          challenge,
        },
        processed: Boolean(challenge),
        process_note: challenge
          ? 'Verification challenge detected and echoed.'
          : 'Verification request captured without a recognized challenge.',
      });
  } catch {
    // Verification must not fail just because diagnostic logging fails.
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,POST,HEAD,OPTIONS');
    return res.status(204).end();
  }

  if (method === 'HEAD') {
    await logVerificationAttempt(req, null);
    return res.status(200).end();
  }

  const challenge = extractVerificationChallenge(req);

  if (method === 'GET') {
    await logVerificationAttempt(req, challenge);
    return res
      .status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .send(challenge || 'OK');
  }

  if (method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Some webhook providers verify URLs with a POST challenge instead of GET.
  // Echo it exactly before treating the request as a WhatsApp event.
  if (challenge) {
    await logVerificationAttempt(req, challenge);
    return res
      .status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .send(challenge);
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const candidates = collectMetaStatusCandidates(body);
    const sb = supabaseAdmin();

    // If OfficialWA performs a POST reachability check without a challenge,
    // accept it and log the exact payload so we can see its verification shape.
    if (!candidates.length && !body?.entry?.length) {
      await logVerificationAttempt(req, null);
      return res.status(200).json({ ok: true });
    }

    const processingNotes: string[] = [];
    let processed = false;

    for (const candidate of candidates) {
      const result = await applyStatus(sb, candidate);
      processingNotes.push(`${candidate.status}: ${result.note}`);
      processed = processed || result.matched;
    }

    const first = candidates[0];
    const firstValue = body?.entry?.[0]?.changes?.[0]?.value;

    const { error: logError } = await sb
      .from('officialwa_webhook_events')
      .insert({
        id: crypto.randomUUID(),
        event_type: first?.status || body?.entry?.[0]?.changes?.[0]?.field || null,
        provider_message_id: first?.messageId || null,
        phone: normalizePhone(first?.recipientId || firstValue?.contacts?.[0]?.wa_id) || null,
        payload: body,
        processed,
        process_note: processingNotes.join(' | ').slice(0, 1500) || 'Captured webhook event.',
      });

    if (logError) throw logError;

    return res.status(200).json({
      ok: true,
      received: true,
      statusEventsFound: candidates.length,
      matchedExistingMessage: processed,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
}
