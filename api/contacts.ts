import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireStaff } from '../server/auth.js';
import { addSheetContact, fetchSheetContacts, setSheetContactStatus } from '../server/googleSheets.js';
import { fetchContactsForSource, normalizeContactSource } from '../server/contactSources.js';
import { createFlowluContact, fetchFlowluContacts } from '../server/flowluContacts.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const source = normalizeContactSource(req.query.source || req.body?.source);

  try {
    if (req.method === 'GET') {
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
        const contacts = await fetchFlowluContacts();

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

    return res.status(permissionProblem ? 403 : 500).json({
      error: permissionProblem
        ? source === 'flowlu'
          ? 'Flowlu API access was denied. Check the Flowlu API key and CRM permissions.'
          : 'Google Sheet write access is blocked for the server service account.'
        : message,
    });
  }
}
