import type { VercelRequest, VercelResponse } from '@vercel/node';
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireStaff(req, res);
  if (!user) return;

  const sb = supabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('whatsapp_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ templates: (data || []).map(serialize) });
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
          created_by: user.id === 'local-development' ? null : user.id,
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
