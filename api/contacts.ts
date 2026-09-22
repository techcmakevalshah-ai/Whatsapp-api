import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { addSheetContact, deleteSheetContact, fetchSheetContacts } from '../server/googleSheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const contacts = await fetchSheetContacts();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ contacts, syncedAt: new Date().toISOString() });
    }

    if (req.method === 'POST') {
      const { name, phone, category, status } = req.body || {};
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
        syncedAt: new Date().toISOString(),
      });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'Contact id is required.' });

      await deleteSheetContact(id);
      const contacts = await fetchSheetContacts();

      return res.status(200).json({
        ok: true,
        contacts,
        syncedAt: new Date().toISOString(),
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Unable to update Google Sheet.';
    const permissionProblem =
      String(error?.code || '').includes('403') ||
      /permission|insufficient|forbidden/i.test(message);

    return res.status(permissionProblem ? 403 : 500).json({
      error: permissionProblem
        ? 'Google Sheet write access is blocked. Change the service account permission on the Sheet from Viewer to Editor.'
        : message,
    });
  }
}
