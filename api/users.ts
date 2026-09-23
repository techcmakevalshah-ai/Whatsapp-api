import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, requireStaff } from '../server/auth.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';

type StaffRole = 'admin' | 'staff';

const PRIMARY_ADMIN_EMAIL = 'tech.cmakevalshah@gmail.com';
const PROJECT_URL = 'https://hdpvabvizwiawonpvzlb.supabase.co';
const FALLBACK_PUBLISHABLE_KEY = 'sb_publishable_3jtMFXgr41bcGW1x1WZQqw_YVLi2a_I';

async function verifyPrimaryAdminPassword(password: unknown) {
  const value = String(password || '');
  if (!value) throw new Error('Primary admin password is required.');

  const verifier = createClient(
    process.env.SUPABASE_URL || PROJECT_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_SUPABASE_ANON_KEY
      || FALLBACK_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { error } = await verifier.auth.signInWithPassword({
    email: PRIMARY_ADMIN_EMAIL,
    password: value,
  });

  if (error) {
    throw new Error('Primary admin password is incorrect.');
  }
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function normalizeRole(value: unknown): StaffRole {
  return String(value || '').toLowerCase() === 'admin' ? 'admin' : 'staff';
}

function normalizeName(value: unknown) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Full name is required.');
  if (name.length > 100) throw new Error('Full name must be 100 characters or fewer.');
  return name;
}

async function activeAdminCount(sb: ReturnType<typeof supabaseAdmin>) {
  const { count, error } = await sb
    .from('staff_users')
    .select('user_id', { count: 'exact', head: true })
    .eq('active', true)
    .eq('role', 'admin');

  if (error) throw error;
  return count || 0;
}

async function audit(
  sb: ReturnType<typeof supabaseAdmin>,
  actorUserId: string,
  targetUserId: string | null,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await sb.from('staff_access_audit').insert({
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action,
    metadata,
  });
  if (error) throw error;
}

async function serializeUsers(sb: ReturnType<typeof supabaseAdmin>) {
  const { data: staffRows, error: staffError } = await sb
    .from('staff_users')
    .select('user_id, email, full_name, role, active, revoked_at, created_at, updated_at, must_set_password')
    .order('created_at', { ascending: true });

  if (staffError) throw staffError;

  const { data: authData, error: authError } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) throw authError;

  const authById = new Map(
    (authData.users || []).map((user) => [user.id, user]),
  );

  return (staffRows || []).map((row: any) => {
    const authUser = authById.get(row.user_id);

    return {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name || '',
      role: row.role === 'admin' ? 'admin' : 'staff',
      active: row.active === true,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      emailConfirmedAt: authUser?.email_confirmed_at || null,
      invitedAt: authUser?.invited_at || null,
      lastSignInAt: authUser?.last_sign_in_at || null,
      authStatus: authUser?.email_confirmed_at ? 'registered' : 'invited',
      mustSetPassword: row.must_set_password === true,
    };
  });
}

function appUrl() {
  return String(process.env.APP_URL || 'https://whatsapp-sigma-lac.vercel.app').replace(/\/$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const view = String(req.query.view || '').toLowerCase();

  if (req.method === 'GET' && view === 'me') {
    const user = await requireStaff(req, res);
    if (!user) return;

    return res.status(200).json({
      profile: {
        id: user.id,
        email: user.email || '',
        fullName: user.fullName || '',
        role: user.role,
        mustSetPassword: user.mustSetPassword,
      },
    });
  }

  if (req.method === 'PATCH' && view === 'me' && String(req.body?.action || '') === 'password_setup_complete') {
    const user = await requireStaff(req, res);
    if (!user) return;

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('staff_users')
      .update({
        must_set_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('active', true);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const sb = supabaseAdmin();

  try {
    if (req.method === 'GET') {
      const users = await serializeUsers(sb);
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const email = normalizeEmail(req.body?.email);
      const fullName = normalizeName(req.body?.fullName);
      const role = normalizeRole(req.body?.role);

      const { data: existingStaff, error: existingStaffError } = await sb
        .from('staff_users')
        .select('user_id, active, must_set_password')
        .eq('email', email)
        .maybeSingle();

      if (existingStaffError) throw existingStaffError;

      if (existingStaff?.active) {
        return res.status(409).json({ error: 'This email already has active dashboard access.' });
      }

      let targetUserId = existingStaff?.user_id || '';
      let invitedNewUser = false;

      if (!targetUserId) {
        const { data: authData, error: listError } = await sb.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listError) throw listError;

        const existingAuthUser = (authData.users || []).find(
          (user) => String(user.email || '').toLowerCase() === email,
        );

        if (existingAuthUser) {
          targetUserId = existingAuthUser.id;
        } else {
          const { data: inviteData, error: inviteError } = await sb.auth.admin.inviteUserByEmail(
            email,
            {
              redirectTo: `${appUrl()}/?invite=1`,
              data: {
                full_name: fullName,
                role,
              },
            },
          );

          if (inviteError) throw inviteError;
          if (!inviteData.user) throw new Error('Supabase did not return the invited user.');

          targetUserId = inviteData.user.id;
          invitedNewUser = true;
        }
      }

      const { error: upsertError } = await sb
        .from('staff_users')
        .upsert({
          user_id: targetUserId,
          email,
          full_name: fullName,
          role,
          active: true,
          revoked_at: null,
          invited_by: admin.id,
          must_set_password: invitedNewUser ? true : existingStaff?.must_set_password === true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;

      await audit(sb, admin.id, targetUserId, 'invite_or_grant_access', {
        email,
        fullName,
        role,
      });

      const users = await serializeUsers(sb);
      const created = users.find((user) => user.id === targetUserId);

      return res.status(201).json({
        user: created,
        invitationSent: created?.authStatus === 'invited',
      });
    }

    if (req.method === 'PATCH') {
      const targetUserId = String(req.query.id || req.body?.id || '').trim();
      const action = String(req.body?.action || '').trim().toLowerCase();

      if (!targetUserId) {
        return res.status(400).json({ error: 'User id is required.' });
      }

      const { data: target, error: targetError } = await sb
        .from('staff_users')
        .select('user_id, email, full_name, role, active')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (targetError) throw targetError;
      if (!target) return res.status(404).json({ error: 'User profile not found.' });

      if (action === 'revoke') {
        if (targetUserId === admin.id) {
          return res.status(400).json({ error: 'You cannot revoke your own admin account.' });
        }

        if (target.role === 'admin' && target.active && (await activeAdminCount(sb)) <= 1) {
          return res.status(400).json({ error: 'The last active admin cannot be revoked.' });
        }

        const now = new Date().toISOString();
        const { error } = await sb
          .from('staff_users')
          .update({
            active: false,
            revoked_at: now,
            updated_at: now,
          })
          .eq('user_id', targetUserId);

        if (error) throw error;

        await audit(sb, admin.id, targetUserId, 'revoke_access', {
          email: target.email,
          role: target.role,
        });

        return res.status(200).json({ ok: true, status: 'revoked' });
      }

      if (action === 'reactivate') {
        const now = new Date().toISOString();
        const { error } = await sb
          .from('staff_users')
          .update({
            active: true,
            revoked_at: null,
            updated_at: now,
          })
          .eq('user_id', targetUserId);

        if (error) throw error;

        await audit(sb, admin.id, targetUserId, 'reactivate_access', {
          email: target.email,
          role: target.role,
        });

        return res.status(200).json({ ok: true, status: 'active' });
      }

      if (action === 'delete_user') {
        if (String(admin.email || '').toLowerCase() !== PRIMARY_ADMIN_EMAIL) {
          return res.status(403).json({
            error: 'Only the primary admin account can permanently delete users.',
          });
        }

        if (targetUserId === admin.id || String(target.email || '').toLowerCase() === PRIMARY_ADMIN_EMAIL) {
          return res.status(400).json({
            error: 'The primary admin account cannot be permanently deleted.',
          });
        }

        try {
          await verifyPrimaryAdminPassword(req.body?.primaryAdminPassword);
        } catch (error) {
          return res.status(401).json({
            error: error instanceof Error ? error.message : 'Primary admin verification failed.',
          });
        }

        const deletedSnapshot = {
          targetUserId,
          email: target.email,
          fullName: target.full_name || '',
          role: target.role,
          wasActive: target.active === true,
        };

        const { error: deleteError } = await sb.auth.admin.deleteUser(targetUserId, false);
        if (deleteError) throw deleteError;

        await audit(sb, admin.id, null, 'permanent_delete_user', deletedSnapshot);

        return res.status(200).json({
          ok: true,
          status: 'deleted',
        });
      }

      if (action === 'update_profile') {
        const fullName = normalizeName(req.body?.fullName);
        const nextRole = normalizeRole(req.body?.role);

        if (targetUserId === admin.id && nextRole !== 'admin') {
          return res.status(400).json({ error: 'You cannot demote your own admin account.' });
        }

        if (
          target.role === 'admin' &&
          nextRole !== 'admin' &&
          target.active &&
          (await activeAdminCount(sb)) <= 1
        ) {
          return res.status(400).json({ error: 'The last active admin cannot be demoted.' });
        }

        const { error } = await sb
          .from('staff_users')
          .update({
            full_name: fullName,
            role: nextRole,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', targetUserId);

        if (error) throw error;

        await audit(sb, admin.id, targetUserId, 'update_profile', {
          email: target.email,
          previousRole: target.role,
          newRole: nextRole,
          fullName,
        });

        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unsupported user action.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to manage users.',
    });
  }
}
