import { Plus, RefreshCw, Search, Trash2, UserRound } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { addContact, deleteContact } from '../lib/api';
import type { Contact } from '../types';

export function ContactsManager({
  contacts,
  syncedAt,
  loading,
  error,
  onRefresh,
  onChanged,
}: {
  contacts: Contact[];
  syncedAt: string;
  loading: boolean;
  error?: string;
  onRefresh: () => void | Promise<void>;
  onChanged: (contacts: Contact[], syncedAt: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [localError, setLocalError] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    category: 'Contact',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) =>
      `${contact.name} ${contact.phone} ${contact.category} ${contact.status}`
        .toLowerCase()
        .includes(term),
    );
  }, [contacts, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError('');

    if (!form.name.trim()) return setLocalError('Enter the contact name.');
    if (form.phone.replace(/\D/g, '').length < 10) return setLocalError('Enter a valid mobile number.');

    setAdding(true);
    try {
      const result = await addContact({
        name: form.name.trim(),
        phone: form.phone.trim(),
        category: form.category.trim() || 'Contact',
        status: form.status,
      });
      onChanged(result.contacts, result.syncedAt);
      setForm({ name: '', phone: '', category: 'Contact', status: 'Active' });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to add contact.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (contact: Contact) => {
    const confirmed = window.confirm(
      `Delete ${contact.name} (${contact.phone}) from the Google Sheet? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(contact.id);
    setLocalError('');
    try {
      const result = await deleteContact(contact.id);
      onChanged(result.contacts, result.syncedAt);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to delete contact.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="contacts-page">
      <div className="contacts-page-head">
        <div>
          <h1>Contacts</h1>
          <p>Live contacts from your Google Sheet. Changes here update the Sheet directly.</p>
        </div>
        <button className="btn secondary" onClick={() => void onRefresh()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''}/>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {(error || localError) && <div className="alert">{localError || error}</div>}

      <section className="card contact-add-card">
        <div className="section-title">
          <span className="contact-title-icon"><Plus size={16}/></span>
          Add Contact
        </div>

        <form className="contact-add-form" onSubmit={submit}>
          <label>
            <span>Name</span>
            <input
              placeholder="Contact name"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            />
          </label>

          <label>
            <span>Mobile Number</span>
            <input
              inputMode="tel"
              placeholder="e.g. 919876543210"
              value={form.phone}
              onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
            />
          </label>

          <label>
            <span>Category</span>
            <input
              placeholder="Contact"
              value={form.category}
              onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm((previous) => ({
                ...previous,
                status: event.target.value as 'Active' | 'Inactive',
              }))}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>

          <button className="btn contact-add-button" disabled={adding}>
            <Plus size={16}/>
            {adding ? 'Adding…' : 'Add Contact'}
          </button>
        </form>
      </section>

      <section className="card contacts-full-card">
        <div className="contacts-list-toolbar">
          <div>
            <div className="section-title contacts-list-title">
              <UserRound size={18}/> All Google Sheet Contacts
            </div>
            <small>
              {contacts.length} contact{contacts.length === 1 ? '' : 's'}
              {syncedAt ? ` · Last synced ${new Date(syncedAt).toLocaleString()}` : ''}
            </small>
          </div>

          <div className="search contacts-search">
            <Search size={17}/>
            <input
              placeholder="Search name, mobile, category or status…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap contacts-full-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Mobile Number</th>
                <th>Category</th>
                <th>Status</th>
                <th className="contact-actions-column">Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((contact, index) => (
                <tr key={contact.id}>
                  <td>{index + 1}</td>
                  <td><b>{contact.name}</b></td>
                  <td>+{contact.phone}</td>
                  <td>{contact.category}</td>
                  <td>
                    <span className={`pill ${contact.status === 'Active' ? 'ok' : 'muted'}`}>
                      {contact.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="contact-delete-button"
                      onClick={() => void remove(contact)}
                      disabled={deletingId === contact.id}
                      title="Delete contact"
                    >
                      <Trash2 size={15}/>
                      {deletingId === contact.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}

              {!filtered.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="contacts-empty">
                      {contacts.length ? 'No contacts match your search.' : 'No contacts found in the Google Sheet.'}
                    </div>
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
