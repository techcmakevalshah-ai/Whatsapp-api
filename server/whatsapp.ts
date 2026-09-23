import { supabaseAdmin } from './supabaseAdmin.js';
type HeaderType = 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT' | null;

type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  body: string;
  variables: number;
  headerType?: HeaderType;
};

function graphBase() {
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  return `https://graph.facebook.com/${version}`;
}

function metaAuthHeaders() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is missing.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function countVariables(body: string) {
  const matches = body.match(/{{\s*\d+\s*}}/g) || [];
  return new Set(matches.map((value) => value.replace(/\D/g, ''))).size;
}

function parseOfficialWaTemplates(): Template[] {
  const raw = process.env.OFFICIALWA_TEMPLATES_JSON;
  if (!raw) {
    const name = process.env.OFFICIALWA_TEMPLATE_NAME;
    if (!name) {
      throw new Error(
        'OfficialWA template catalog is not configured. Set OFFICIALWA_TEMPLATES_JSON or OFFICIALWA_TEMPLATE_NAME in Vercel.',
      );
    }
    const language = process.env.OFFICIALWA_TEMPLATE_LANGUAGE || 'en';
    const variables = Number(process.env.OFFICIALWA_TEMPLATE_VARIABLES || '0');
    const knownBodies: Record<string, string> = {
      '22nd_aug_3': [
        '5 hours {{1}}',
        '{{2}} land as an asset, {{3}} again.',
        'Co{{4}} way.',
        '👉 {{5}}',
        'Thank you.',
      ].join('\n'),
    };

    const body =
      process.env.OFFICIALWA_TEMPLATE_BODY ||
      knownBodies[name] ||
      [
        `Template: ${name}`,
        ...Array.from({ length: Number.isFinite(variables) ? variables : 0 }, (_, i) => `{{${i + 1}}}`),
      ].join('\n');

    return [{
      id: `officialwa:${name}:${language}`,
      name,
      language,
      status: 'APPROVED',
      body,
      variables: Number.isFinite(variables) ? Math.max(0, variables) : 0,
      headerType: null,
    }];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OFFICIALWA_TEMPLATES_JSON is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('OFFICIALWA_TEMPLATES_JSON must be a JSON array.');
  }

  return parsed.map((item: any, index) => {
    const name = String(item?.name || '').trim();
    if (!name) throw new Error(`OfficialWA template at index ${index} is missing a name.`);

    const language = String(item?.language || 'en').trim() || 'en';
    const variables = Number(item?.variables ?? countVariables(String(item?.body || '')));
    return {
      id: String(item?.id || `officialwa:${name}:${language}`),
      name,
      language,
      status: String(item?.status || 'APPROVED').toUpperCase(),
      category: item?.category ? String(item.category) : undefined,
      body:
        String(item?.body || '').trim() ||
        [
          `Template: ${name}`,
          ...Array.from({ length: Number.isFinite(variables) ? variables : 0 }, (_, i) => `{{${i + 1}}}`),
        ].join('\n'),
      variables: Number.isFinite(variables) ? Math.max(0, variables) : 0,
      headerType: item?.headerType || null,
    } satisfies Template;
  });
}


async function loadOfficialWaTemplates(): Promise<Template[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('whatsapp_templates')
      .select('id, provider_template_id, name, language, category, body, status, variables, header_type')
      .eq('status', 'APPROVED')
      .order('name', { ascending: true });

    if (error) throw error;

    if (data?.length) {
      return data.map((row: any) => ({
        id: row.id,
        name: row.name,
        language: row.language || 'en',
        status: row.status,
        category: row.category || undefined,
        body: row.body || '',
        variables: Number(row.variables || 0),
        headerType: row.header_type || null,
      }));
    }
  } catch (error) {
    console.warn(
      'Unable to load OfficialWA templates from Supabase, using environment fallback:',
      error instanceof Error ? error.message : error,
    );
  }

  return parseOfficialWaTemplates().filter((template) => template.status === 'APPROVED');
}

function officialWaReceiver(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const mode = (process.env.OFFICIALWA_RECEIVER_MODE || 'e164').toLowerCase();

  if (mode === 'local10') return digits.slice(-10);
  return digits;
}

function officialWaEndpoint() {
  const base = (process.env.OFFICIALWA_BASE_URL || 'https://crm.officialwa.com/api/meta/v19.0').replace(/\/$/, '');
  const senderId = process.env.OFFICIALWA_SENDER_ID;
  if (!senderId) throw new Error('OFFICIALWA_SENDER_ID is missing in Vercel environment variables.');
  return `${base}/${encodeURIComponent(senderId)}/messages`;
}

function officialWaHeaders() {
  const token = process.env.OFFICIALWA_ACCESS_TOKEN;
  if (!token) throw new Error('OFFICIALWA_ACCESS_TOKEN is missing in Vercel environment variables.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function listTemplates(): Promise<Template[]> {
  const provider = (process.env.WHATSAPP_PROVIDER || 'officialwa').toLowerCase();

  if (provider === 'officialwa') {
    return loadOfficialWaTemplates();
  }

  if (provider !== 'meta') {
    throw new Error(`Unsupported WhatsApp provider: ${provider}`);
  }

  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) throw new Error('WHATSAPP_WABA_ID is missing.');

  const url = `${graphBase()}/${wabaId}/message_templates?status=APPROVED&limit=100`;
  const response = await fetch(url, { headers: metaAuthHeaders() });
  const json: any = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || 'Unable to load WhatsApp templates.');

  return (json.data || []).map((template: any) => {
    const bodyComponent = (template.components || []).find((component: any) => component.type === 'BODY');
    const headerComponent = (template.components || []).find((component: any) => component.type === 'HEADER');
    const body = bodyComponent?.text || '';
    const format = String(headerComponent?.format || '').toUpperCase();
    const headerType: HeaderType = ['IMAGE', 'VIDEO', 'DOCUMENT', 'TEXT'].includes(format)
      ? (format as HeaderType)
      : null;

    return {
      id: template.id,
      name: template.name,
      language: template.language,
      status: template.status,
      category: template.category,
      body,
      variables: countVariables(body),
      headerType,
    };
  });
}

export async function sendTemplateMessage(input: {
  phone: string;
  templateName: string;
  language: string;
  params: string[];
  headerType?: HeaderType;
  mediaUrl?: string | null;
}) {
  const provider = (process.env.WHATSAPP_PROVIDER || 'officialwa').toLowerCase();

  if (provider === 'officialwa') {
    const components: any[] = [];

    if (input.headerType && ['IMAGE', 'VIDEO'].includes(input.headerType)) {
      if (!input.mediaUrl) {
        throw new Error(`${input.headerType.toLowerCase()} template requires an uploaded media file.`);
      }
      const type = input.headerType.toLowerCase();
      components.push({
        type: 'header',
        parameters: [{
          type,
          [type]: { link: input.mediaUrl },
        }],
      });
    }

    if (input.params.length) {
      components.push({
        type: 'body',
        parameters: input.params.map((text) => ({
          type: 'text',
          text,
        })),
      });
    }

    const payload = {
      to: officialWaReceiver(input.phone),
      recipient_type: 'individual',
      type: 'template',
      template: {
        language: {
          policy: 'deterministic',
          code: input.language || 'en',
        },
        name: input.templateName,
        components,
      },
    };

    const response = await fetch(officialWaEndpoint(), {
      method: 'POST',
      headers: officialWaHeaders(),
      body: JSON.stringify(payload),
    });

    const json: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        json?.error?.message ||
        json?.message ||
        json?.error ||
        `OfficialWA send failed with HTTP ${response.status}.`,
      );
    }

    const providerMessageId =
      json?.messages?.[0]?.id ||
      json?.data?.messages?.[0]?.id ||
      json?.response?.messages?.[0]?.id ||
      json?.message_id ||
      json?.id ||
      '';

    const queueId =
      json?.message?.queue_id ||
      json?.queue_id ||
      json?.data?.message?.queue_id ||
      json?.data?.queue_id ||
      '';

    return {
      messageId: providerMessageId || queueId || '',
      queued: Boolean(queueId && !providerMessageId),
    };
  }

  if (provider !== 'meta') {
    throw new Error(`Unsupported WhatsApp provider: ${provider}`);
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is missing.');

  const components: any[] = [];
  if (input.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(input.headerType)) {
    if (!input.mediaUrl) throw new Error(`${input.headerType.toLowerCase()} template requires a public media URL.`);
    const type = input.headerType.toLowerCase();
    components.push({ type: 'header', parameters: [{ type, [type]: { link: input.mediaUrl } }] });
  }
  if (input.params.length) {
    components.push({
      type: 'body',
      parameters: input.params.map((text) => ({ type: 'text', text })),
    });
  }

  const response = await fetch(`${graphBase()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: metaAuthHeaders(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: input.phone.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        components,
      },
    }),
  });
  const json: any = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || 'WhatsApp send failed.');
  return { messageId: json.messages?.[0]?.id || '', queued: false };
}
