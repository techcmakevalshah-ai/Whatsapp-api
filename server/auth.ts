import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './supabaseAdmin.js';

export type StaffUser = {
  id: string;
  email?: string | null;
  fullName?: string | null;
  role: 'admin' | 'staff';
};

export async function requireStaff(req: VercelRequest, res: VercelResponse): Promise<StaffUser | null> {
  try {
    if (process.env.DISABLE_AUTH === 'true' && process.env.VERCEL_ENV !== 'production') {
      return {
        id: 'local-development',
        email: 'local@development.test',
        fullName: 'Local Development',
        role: 'admin',
      };
    }

    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return null;
    }

    const sb = supabaseAdmin();
    const { data, error } = await sb.auth.getUser(token);
    const user = data?.user;

    if (error || !user) {
      res.status(401).json({ error: 'Your session is invalid or expired.' });
      return null;
    }

    const { data: staff, error: staffError } = await sb
      .from('staff_users')
      .select('user_id, email, full_name, role, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (staffError) {
      throw new Error(`Unable to verify staff access: ${staffError.message}`);
    }

    if (!staff) {
      res.status(403).json({ error: 'This account does not have active dashboard access.' });
      return null;
    }

    return {
      id: user.id,
      email: staff.email || user.email,
      fullName: staff.full_name || null,
      role: staff.role === 'admin' ? 'admin' : 'staff',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server authentication configuration failed.';
    res.status(500).json({ error: message });
    return null;
  }
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<StaffUser | null> {
  const user = await requireStaff(req, res);
  if (!user) return null;

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access is required.' });
    return null;
  }

  return user;
}
