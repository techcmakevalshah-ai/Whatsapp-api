import { Ban, CheckCircle2, Crown, Pencil, Plus, Search, ShieldCheck, UserRound } from 'lucide-react';
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
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    role: 'staff' as 'admin' | 'staff',
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      `${user.fullName} ${user.email} ${user.role} ${user.active ? 'active' : 'revoked'}`
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

    const roleAnswer = window.prompt('Role: admin or staff', user.role)?.trim().toLowerCase();
    if (!roleAnswer || !['admin', 'staff'].includes(roleAnswer)) {
      setLocalError('Role must be admin or staff.');
      return;
    }

    setBusyId(user.id);
    setLocalError('');
    setSuccess('');
    try {
      await updateStaffUser(user.id, {
        action: 'update_profile',
        fullName,
        role: roleAnswer as 'admin' | 'staff',
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

  return (
    <div className="users-page">
      <div className="contacts-page-head">
        <div>
          <h1>Users & Access</h1>
          <p>Create staff or admin profiles and revoke access without deleting historical data.</p>
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
              <option value="staff">Staff User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <button className="btn contact-add-button" disabled={saving}>
            {form.role === 'admin' ? <Crown size={16}/> : <UserRound size={16}/>}
            {saving ? 'Creating…' : 'Create & Send Invite'}
          </button>
        </form>

        <div className="user-invite-note">
          New users receive a Supabase email invitation and set their own password. Admin users can manage access; staff users cannot open this page.
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
                      <span className={`pill ${user.role === 'admin' ? 'admin-pill' : 'staff-pill'}`}>
                        {user.role === 'admin' ? 'Admin' : 'Staff'}
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
    </div>
  );
}
