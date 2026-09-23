import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

const ALLOWED_STATUS = new Set(['DRAFT', 'APPROVED']);
const ALLOWED_CATEGORY = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION']);

function detectVariables(body: string) {
  const matches = [...body.matchAll(/{{\s*(\d+)\s*}}/g)].map((match) => Number(match[1]));
  if (!matches.length) return 0;

  const unique = [...new Set(matches)].sort((a, b) => a - b);
  const max = unique[unique.length - 1];
  const expected = Array.from({ length: max }, (_, index) => index + 1);

  if (unique.length !== expected.length || unique.some((value, index) => value !== expected[index])) {
    throw new Error('Template variables must be sequential: {{1}}, {{2}}, {{3}} ... without gaps.');
  }

  return max;
}

function validateName(value: unknown) {
  const name = String(value || '').trim();
  if (!name) throw new Error('Template name is required.');
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error('Template name can contain only lowercase letters, numbers and underscores.');
  }
  return name;
}

function validateLanguage(value: unknown) {
  const language = String(value || 'en').trim();
  if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error('Use a language code such as en, hi, gu or en_US.');
  }
  return language;
}

function validateFolderName(value: unknown) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Folder name is required.');
  if (name.length > 60) throw new Error('Folder name must be 60 characters or fewer.');
  return name;
}

function serialize(row: any) {
  return {
    id: row.id,
    providerTemplateId: row.provider_template_id,
    name: row.name,
    language: row.language,
    category: row.category,
    body: row.body,
    footer: row.footer,
    status: row.status,
    variables: row.variables,
    headerType: row.header_type || null,
    folderId: row.folder_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeFolder(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function validateFolder(
  sb: ReturnType<typeof supabaseAdmin>,
  folderId: unknown,
  ownerId: string | null,
) {
  const value = String(folderId || '').trim();
  if (!value) return null;

  let query = sb
    .from('template_folders')
    .select('id')
    .eq('id', value)
    .eq('active', true);

  if (ownerId) query = query.eq('created_by', ownerId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Selected template folder does not exist or is inactive.');
  return data.id as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();
  const ownerId = user.id === 'local-development' ? null : user.id;
  const scope = String(req.body?.scope || req.query.scope || '').trim().toLowerCase();

  try {
    if (req.method === 'GET') {
      const [{ data: templateRows, error: templatesError }, { data: folderRows, error: foldersError }] =
        await Promise.all([
          sb.from('whatsapp_templates').select('*').order('created_at', { ascending: false }),
          (() => {
            let query = sb
              .from('template_folders')
              .select('*')
              .eq('active', true)
              .order('name', { ascending: true });
            if (ownerId) query = query.eq('created_by', ownerId);
            return query;
          })(),
        ]);

      if (templatesError) throw templatesError;
      if (foldersError) throw foldersError;

      return res.status(200).json({
        templates: (templateRows || []).map(serialize),
        folders: (folderRows || []).map(serializeFolder),
      });
    }

    if (req.method === 'POST' && scope === 'folder') {
      const name = validateFolderName(req.body?.name);
      const description = String(req.body?.description || '').trim() || null;

      const { data, error } = await sb
        .from('template_folders')
        .insert({
          id: crypto.randomUUID(),
          name,
          description,
          active: true,
          created_by: ownerId,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A folder with this name already exists.' });
      }
      if (error) throw error;

      return res.status(201).json({ folder: serializeFolder(data) });
    }

    if (req.method === 'PATCH' && scope === 'folder') {
      const id = String(req.query.id || req.body?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Folder id is required.' });

      const name = validateFolderName(req.body?.name);
      const description = String(req.body?.description || '').trim() || null;

      let query = sb
        .from('template_folders')
        .update({
          name,
          description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('active', true);

      if (ownerId) query = query.eq('created_by', ownerId);

      const { data, error } = await query.select('*').maybeSingle();

      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A folder with this name already exists.' });
      }
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Template folder not found.' });

      return res.status(200).json({ folder: serializeFolder(data) });
    }

    if (req.method === 'DELETE' && scope === 'folder') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Folder id is required.' });

      let ownership = sb
        .from('template_folders')
        .select('id')
        .eq('id', id)
        .eq('active', true);

      if (ownerId) ownership = ownership.eq('created_by', ownerId);

      const { data: folder, error: folderError } = await ownership.maybeSingle();
      if (folderError) throw folderError;
      if (!folder) return res.status(404).json({ error: 'Template folder not found.' });

      const { error: unfileError } = await sb
        .from('whatsapp_templates')
        .update({ folder_id: null, updated_at: new Date().toISOString() })
        .eq('folder_id', id);

      if (unfileError) throw unfileError;

      const { error: archiveError } = await sb
        .from('template_folders')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (archiveError) throw archiveError;

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH' && scope === 'move') {
      const id = String(req.query.id || req.body?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Template id is required.' });

      const folderId = await validateFolder(sb, req.body?.folderId, ownerId);

      const { data, error } = await sb
        .from('whatsapp_templates')
        .update({
          folder_id: folderId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Template not found.' });

      return res.status(200).json({ template: serialize(data) });
    }

    if (req.method === 'POST') {
      const {
        name: rawName,
        language: rawLanguage,
        category: rawCategory,
        body: rawBody,
        footer: rawFooter,
        status: rawStatus,
        confirmProviderApproved,
        headerType: rawHeaderType,
        folderId: rawFolderId,
      } = req.body || {};

      const name = validateName(rawName);
      const language = validateLanguage(rawLanguage);
      const body = String(rawBody || '').trim();
      if (!body) return res.status(400).json({ error: 'Template body is required.' });

      const category = String(rawCategory || 'UTILITY').toUpperCase();
      if (!ALLOWED_CATEGORY.has(category)) {
        return res.status(400).json({ error: 'Invalid template category.' });
      }

      const status = String(rawStatus || 'DRAFT').toUpperCase();
      if (!ALLOWED_STATUS.has(status)) {
        return res.status(400).json({ error: 'Status must be Draft or Approved.' });
      }

      if (status === 'APPROVED' && confirmProviderApproved !== true) {
        return res.status(400).json({
          error: 'Confirm that this exact template is already approved in OfficialWA before marking it Approved.',
        });
      }

      const variables = detectVariables(body);
      const headerType = rawHeaderType ? String(rawHeaderType).toUpperCase() : null;
      if (headerType && !['IMAGE', 'VIDEO'].includes(headerType)) {
        return res.status(400).json({ error: 'Header type must be Image, Video or None.' });
      }

      const folderId = await validateFolder(sb, rawFolderId, ownerId);

      const { data, error } = await sb
        .from('whatsapp_templates')
        .insert({
          name,
          language,
          category,
          body,
          footer: String(rawFooter || '').trim() || null,
          status,
          variables,
          header_type: headerType,
          folder_id: folderId,
          created_by: ownerId,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A template with this name and language already exists.' });
      }
      if (error) throw error;

      return res.status(201).json({ template: serialize(data) });
    }

    if (req.method === 'PATCH') {
      const id = String(req.query.id || req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'Template id is required.' });

      const {
        name: rawName,
        language: rawLanguage,
        category: rawCategory,
        body: rawBody,
        footer: rawFooter,
        status: rawStatus,
        confirmProviderApproved,
        headerType: rawHeaderType,
        folderId: rawFolderId,
      } = req.body || {};

      const name = validateName(rawName);
      const language = validateLanguage(rawLanguage);
      const body = String(rawBody || '').trim();
      if (!body) return res.status(400).json({ error: 'Template body is required.' });

      const category = String(rawCategory || 'UTILITY').toUpperCase();
      if (!ALLOWED_CATEGORY.has(category)) {
        return res.status(400).json({ error: 'Invalid template category.' });
      }

      const status = String(rawStatus || 'DRAFT').toUpperCase();
      if (!ALLOWED_STATUS.has(status)) {
        return res.status(400).json({ error: 'Status must be Draft or Approved.' });
      }

      if (status === 'APPROVED' && confirmProviderApproved !== true) {
        return res.status(400).json({
          error: 'Confirm that this exact template is already approved in OfficialWA before marking it Approved.',
        });
      }

      const variables = detectVariables(body);
      const headerType = rawHeaderType ? String(rawHeaderType).toUpperCase() : null;
      if (headerType && !['IMAGE', 'VIDEO'].includes(headerType)) {
        return res.status(400).json({ error: 'Header type must be Image, Video or None.' });
      }

      const folderId = await validateFolder(sb, rawFolderId, ownerId);

      const { data, error } = await sb
        .from('whatsapp_templates')
        .update({
          name,
          language,
          category,
          body,
          footer: String(rawFooter || '').trim() || null,
          status,
          variables,
          header_type: headerType,
          folder_id: folderId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A template with this name and language already exists.' });
      }
      if (error) throw error;

      return res.status(200).json({ template: serialize(data) });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'Template id is required.' });

      const { error } = await sb
        .from('whatsapp_templates')
        .update({ status: 'DISABLED', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to manage templates.',
    });
  }
}
