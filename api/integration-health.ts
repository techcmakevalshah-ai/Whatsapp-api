import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchSheetContacts } from '../server/googleSheets.js';
import { listTemplates } from '../server/whatsapp.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result: Record<string, unknown> = {
    google: {
      configured: Boolean(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ),
      readOk: false,
      contactCount: null,
      error: null,
    },
    whatsapp: {
      provider: (process.env.WHATSAPP_PROVIDER || 'officialwa').toLowerCase(),
      configured: Boolean(
        process.env.OFFICIALWA_SENDER_ID &&
        process.env.OFFICIALWA_ACCESS_TOKEN
      ),
      templateConfigOk: false,
      templateCount: null,
      error: null,
    },
  };

  try {
    const contacts = await fetchSheetContacts();
    (result.google as any).readOk = true;
    (result.google as any).contactCount = contacts.length;
  } catch (error) {
    (result.google as any).error = error instanceof Error ? error.message : 'Google read failed';
  }

  try {
    const templates = await listTemplates();
    (result.whatsapp as any).templateConfigOk = true;
    (result.whatsapp as any).templateCount = templates.length;
  } catch (error) {
    (result.whatsapp as any).error = error instanceof Error ? error.message : 'WhatsApp config failed';
  }

  return res.status(200).json(result);
}
