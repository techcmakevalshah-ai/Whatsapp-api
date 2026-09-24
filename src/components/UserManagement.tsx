import { Ban, CheckCircle2, Crown, LockKeyhole, Pencil, Plus, Search, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { getStaffUsers, inviteStaffUser, updateStaffUser } from '../lib/api';
import type { StaffProfile, StaffUserProfile } from '../types';

export function UserManagement({
  currentProfile,
  users,
  loading,
  error,
  onRefresh,
}: {
  currentProfile: StaffProfile;
  users: StaffUserProfile[];
  loading: boolean;
  error?: string;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StaffUserProfile | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    role: 'staff' as 'admin' | 'staff',
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      `${user.fullName} ${user.email} ${user.role === 'admin' ? 'admin' : 'team'} ${user.active ? 'active' : 'revoked'}`
        .toLowerCase()
        .includes(term),
    );
  }, [users, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');
    setSuccess('');

    if (!form.fullName.trim()) return setLocalError('Enter the user’s full name.');
    if (!form.email.trim()) return setLocalError('Enter the user’s email address.');

    setSaving(true);
    try {
      const result = await inviteStaffUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
      });

      setSuccess(
        result.invitationSent
          ? `Invitation sent to ${result.user.email}.`
          : `Access granted to ${result.user.email}.`,
      );
      setForm({ fullName: '', email: '', role: 'staff' });
      await onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to create user profile.');
    } finally {
      setSaving(false);
    }
  };

  const edit = async (user: StaffUserProfile) => {
    const fullName = window.prompt('Full name', user.fullName)?.trim();
    if (!fullName) return;

    const roleAnswer = window.prompt('Role: admin or team', user.role === 'admin' ? 'admin' : 'team')?.trim().toLowerCase();
    if (!roleAnswer || !['admin', 'team'].includes(roleAnswer)) {
      setLocalError('Role must be admin or team.');
      return;
    }
    const internalRole = roleAnswer === 'admin' ? 'admin' : 'staff';

    setBusyId(user.id);
    setLocalError('');
    setSuccess('');
    try {
      await updateStaffUser(user.id, {
        action: 'update_profile',
        fullName,
        role: internalRole as 'admin' | 'staff',
      });
      setSuccess(`${user.email} profile updated.`);
      await onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setBusyId('');
    }
  };

  const toggleAccess = async (user: StaffUserProfile) => {
    const action = user.active ? 'revoke' : 'reactivate';
    const confirmed = window.confirm(
      user.active
        ? `Revoke access for ${user.fullName || user.email}? Their historical data will remain intact.`
        : `Reactivate access for ${user.fullName || user.email}?`,
    );
    if (!confirmed) return;

    setBusyId(user.id);
    setLocalError('');
    setSuccess('');
    try {
      await updateStaffUser(user.id, { action });
      setSuccess(
        user.active
          ? `Access revoked for ${user.email}.`
          : `Access restored for ${user.email}.`,
      );
      await onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to update user access.');
    } finally {
      setBusyId('');
    }
  };

  const openDelete = (user: StaffUserProfile) => {
    setDeleteTarget(user);
    setDeletePassword('');
    setLocalError('');
    setSuccess('');
  };

  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeletePassword('');
  };

  const permanentlyDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (!deleteTarget) return;

    if (!deletePassword) {
      setLocalError('Enter the primary admin password to continue.');
      return;
    }

    setDeleteBusy(true);
    setLocalError('');
    setSuccess('');

    try {
      await updateStaffUser(deleteTarget.id, {
        action: 'delete_user',
        primaryAdminPassword: deletePassword,
      });

      const deletedEmail = deleteTarget.email;
      setDeleteTarget(null);
      setDeletePassword('');
      setSuccess(`User ${deletedEmail} permanently deleted.`);
      await onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to permanently delete user.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const canPermanentlyDelete =
    currentProfile.email.trim().toLowerCase() === 'tech.cmakevalshah@gmail.com';

  return (
    <div className="users-page">
      <div className="contacts-page-head">
        <div>
          <h1>Users & Access</h1>
          <p>Create team or admin profiles and revoke access without deleting historical data.</p>
        </div>
        <div className="admin-profile-badge">
          <ShieldCheck size={18}/>
          <div>
            <b>{currentProfile.fullName || currentProfile.email}</b>
            <span>Administrator</span>
          </div>
        </div>
      </div>

      {(error || localError) && <div className="alert">{localError || error}</div>}
      {success && <div className="test-success">{success}</div>}

      <section className="card user-invite-card">
        <div className="section-title">
          <span className="contact-title-icon"><Plus size={16}/></span>
          Create User Profile
        </div>

        <form className="user-invite-form" onSubmit={submit}>
          <label>
            <span>Full Name</span>
            <input
              value={form.fullName}
              onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
              placeholder="e.g. Keval Shah"
              maxLength={100}
            />
          </label>

          <label>
            <span>Email Address</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
              placeholder="name@company.com"
            />
          </label>

          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                role: event.target.value as 'admin' | 'staff',
              }))}
            >
              <option value="staff">Team User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <button className="btn contact-add-button" disabled={saving}>
            {form.role === 'admin' ? <Crown size={16}/> : <UserRound size={16}/>}
            {saving ? 'Creating…' : 'Create & Send Invite'}
          </button>
        </form>

        <div className="user-invite-note">
          New users receive a Supabase email invitation and set their own password. Admin users can manage access; team users cannot open this page.
        </div>
      </section>

      <section className="card contacts-full-card">
        <div className="contacts-list-toolbar">
          <div>
            <div className="section-title contacts-list-title">
              <UserRound size={18}/> User Profiles
            </div>
            <small>{users.length} profile{users.length === 1 ? '' : 's'}</small>
          </div>

          <div className="search contacts-search">
            <Search size={17}/>
            <input
              placeholder="Search name, email, role or status…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap users-table">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Account</th>
                <th>Access</th>
                <th>Last Sign In</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const isYou = user.id === currentProfile.id;

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="user-profile-cell">
                        <span className={`user-role-avatar ${user.role}`}>
                          {user.role === 'admin' ? <Crown size={15}/> : <UserRound size={15}/>}
                        </span>
                        <div>
                          <b>{user.fullName || 'Unnamed User'} {isYou && <small>(You)</small>}</b>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${user.role === 'admin' ? 'admin-pill' : 'team-pill'}`}>
                        {user.role === 'admin' ? 'Admin' : 'Team'}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${user.authStatus === 'registered' ? 'ok' : 'pending-pill'}`}>
                        {user.authStatus === 'registered' ? 'Registered' : 'Invited'}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${user.active ? 'ok' : 'muted'}`}>
                        {user.active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td>{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : '—'}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="user-row-actions">
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => void edit(user)}
                        >
                          <Pencil size={14}/> Edit
                        </button>

                        {!isYou && (
                          <button
                            className={`btn ${user.active ? 'danger-outline' : 'user-reactivate-btn'}`}
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => void toggleAccess(user)}
                          >
                            {user.active ? <Ban size={14}/> : <CheckCircle2 size={14}/>}
                            {busyId === user.id ? 'Updating…' : user.active ? 'Revoke' : 'Reactivate'}
                          </button>
                        )}

                        {!isYou && canPermanentlyDelete && (
                          <button
                            className="btn user-delete-btn"
                            type="button"
                            disabled={busyId === user.id || deleteBusy}
                            onClick={() => openDelete(user)}
                          >
                            <Trash2 size={14}/> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="contacts-empty">No user profiles match your search.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {deleteTarget && (
        <div className="modal-backdrop user-delete-backdrop" onMouseDown={closeDelete}>
          <form
            className="user-delete-modal"
            onSubmit={permanentlyDelete}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2>Permanently Delete User</h2>
                <p>This removes the Supabase login and user profile. Historical campaign/template records remain.</p>
              </div>
              <button className="icon-btn" type="button" onClick={closeDelete} disabled={deleteBusy}>
                <X size={19}/>
              </button>
            </div>

            <div className="user-delete-target">
              <Trash2 size={18}/>
              <div>
                <b>{deleteTarget.fullName || 'Unnamed User'}</b>
                <span>{deleteTarget.email}</span>
              </div>
            </div>

            <div className="user-delete-warning">
              This action cannot be undone. To authorize it, enter the current password for
              <b> tech.cmakevalshah@gmail.com</b>.
            </div>

            <label className="user-delete-password">
              <span>Primary Admin Password</span>
              <div>
                <LockKeyhole size={16}/>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  placeholder="Enter password"
                  required
                  autoFocus
                />
              </div>
            </label>

            <div className="user-delete-actions">
              <button className="btn secondary" type="button" onClick={closeDelete} disabled={deleteBusy}>
                Cancel
              </button>
              <button className="btn user-delete-confirm-btn" disabled={deleteBusy || !deletePassword}>
                <Trash2 size={15}/>
                {deleteBusy ? 'Verifying & Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
