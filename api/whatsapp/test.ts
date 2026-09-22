import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../../server/auth.js';
import { listTemplates, sendTemplateMessage } from '../../server/whatsapp.js';

function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Enter a valid WhatsApp number with country code.');
  }
  return digits;
}

function resolveTestValue(value: string, phone: string) {
  const replacements: Record<string, string> = {
    name: 'Test',
    phone,
    category: 'Test',
  };

  return String(value || '').replace(
    /\{\{?\s*(name|phone|category)\s*\}?\}/gi,
    (_, key: string) => replacements[key.toLowerCase()] || '',
  ).trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    const {
      phone: rawPhone,
      templateName,
      templateLanguage,
      variableValues,
      mediaUrl,
    } = req.body || {};

    const phone = normalizePhone(rawPhone);

    const approvedTemplates = await listTemplates();
    const template = approvedTemplates.find(
      (item) => item.name === templateName && item.language === (templateLanguage || item.language),
    );

    if (!template || template.status !== 'APPROVED') {
      return res.status(400).json({ error: 'The selected template is not approved or no longer exists.' });
    }

    if (
      template.headerType &&
      ['IMAGE', 'VIDEO'].includes(template.headerType) &&
      !String(mediaUrl || '').trim()
    ) {
      return res.status(400).json({
        error: `Upload the required ${template.headerType.toLowerCase()} before sending a test.`,
      });
    }

    const params = Array.from({ length: template.variables }, (_, index) => {
      const key = String(index + 1);
      const raw = String(variableValues?.[key] || '');
      const resolved = resolveTestValue(raw, phone);
      if (!resolved) throw new Error(`Template variable {{${key}}} is empty.`);
      return resolved;
    });

    const sent = await sendTemplateMessage({
      phone,
      templateName: template.name,
      language: template.language,
      params,
      headerType: template.headerType,
      mediaUrl: String(mediaUrl || '').trim() || null,
    });

    return res.status(200).json({
      ok: true,
      messageId: sent.messageId || null,
      phoneLast4: phone.slice(-4),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to send test message.',
    });
  }
}
