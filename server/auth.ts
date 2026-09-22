import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './supabaseAdmin.js';

export type StaffUser = { id: string; email?: string | null };

function allowedEmail(email?: string | null) {
  const allowlist = (process.env.STAFF_EMAIL_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const domain = (process.env.STAFF_EMAIL_DOMAIN || '').trim().toLowerCase().replace(/^@/, '');
  if (!allowlist.length && !domain) return true;
  const normalized = String(email || '').toLowerCase();
  return allowlist.includes(normalized) || (domain ? normalized.endsWith(`@${domain}`) : false);
}

export async function requireStaff(req: VercelRequest, res: VercelResponse): Promise<StaffUser | null> {
  if (process.env.DISABLE_AUTH === 'true' && process.env.VERCEL_ENV !== 'production') {
    return { id: 'local-development', email: 'local@development.test' };
  }

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    res.status(401).json({ error: 'Your session is invalid or expired.' });
    return null;
  }
  if (!allowedEmail(user.email)) {
    res.status(403).json({ error: 'This account is not authorized for the staff dashboard.' });
    return null;
  }
  return { id: user.id, email: user.email };
}
