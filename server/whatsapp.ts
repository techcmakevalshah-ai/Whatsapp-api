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

function authHeaders() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is missing.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function countVariables(body: string) {
  const matches = body.match(/{{\s*\d+\s*}}/g) || [];
  return new Set(matches.map((value) => value.replace(/\D/g, ''))).size;
}

export async function listTemplates(): Promise<Template[]> {
  const provider = process.env.WHATSAPP_PROVIDER || 'meta';
  if (provider !== 'meta') throw new Error('Custom provider template adapter is not configured yet.');

  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) throw new Error('WHATSAPP_WABA_ID is missing.');

  const url = `${graphBase()}/${wabaId}/message_templates?status=APPROVED&limit=100`;
  const response = await fetch(url, { headers: authHeaders() });
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
  const provider = process.env.WHATSAPP_PROVIDER || 'meta';

  if (provider === 'custom') {
    const url = process.env.WHATSAPP_CUSTOM_API_URL;
    const token = process.env.WHATSAPP_CUSTOM_API_TOKEN;
    if (!url || !token) throw new Error('Custom WhatsApp provider URL/token is missing.');
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error || json?.message || 'Custom provider send failed.');
    return { messageId: json.messageId || json.id || '' };
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
    headers: authHeaders(),
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
  return { messageId: json.messages?.[0]?.id || '' };
}
