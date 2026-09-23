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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // OfficialWA verifies outbound webhook URLs with a challenge request.
    // Its setup UI does not expose a user-defined verify token, so echo the
    // challenge when present instead of requiring WHATSAPP_VERIFY_TOKEN.
    const challenge =
      req.query['hub.challenge'] ??
      req.query.challenge ??
      req.query['challenge_token'] ??
      req.query['verify_challenge'];

    if (challenge !== undefined && challenge !== null) {
      return res
        .status(200)
        .setHeader('Content-Type', 'text/plain; charset=utf-8')
        .send(String(Array.isArray(challenge) ? challenge[0] : challenge));
    }

    // Some providers only check that the endpoint is publicly reachable.
    return res
      .status(200)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .send('OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const candidates = collectMetaStatusCandidates(body);
    const sb = supabaseAdmin();

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
