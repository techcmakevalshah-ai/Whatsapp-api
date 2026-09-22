import { Ban, CheckCircle2, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { addContact, setContactStatus } from '../lib/api';
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [adding, setAdding] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState('');
  const [localError, setLocalError] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    category: 'Contact',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const categories = useMemo(
    () => [...new Set(contacts.map((contact) => contact.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [contacts],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesSearch = !term || `${contact.name} ${contact.phone} ${contact.category} ${contact.status}`
        .toLowerCase()
        .includes(term);
      const matchesCategory = categoryFilter === 'all' || contact.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || contact.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [contacts, query, categoryFilter, statusFilter]);

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

  const changeStatus = async (contact: Contact) => {
    const nextStatus = contact.status === 'Active' ? 'Inactive' : 'Active';
    const confirmed = window.confirm(
      nextStatus === 'Inactive'
        ? `Deactivate ${contact.name}? The row will remain in Google Sheets and can be reactivated later.`
        : `Reactivate ${contact.name}?`,
    );
    if (!confirmed) return;

    setChangingStatusId(contact.id);
    setLocalError('');
    try {
      const result = await setContactStatus(contact.id, nextStatus);
      onChanged(result.contacts, result.syncedAt);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to update contact status.');
    } finally {
      setChangingStatusId('');
    }
  };

  return (
    <div className="contacts-page">
      <div className="contacts-page-head">
        <div>
          <h1>Contacts</h1>
          <p>Live contacts from your Google Sheet. Contacts can be added or deactivated; permanent deletion is blocked.</p>
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

          <div className="contacts-manager-filters">
            <div className="search contacts-search">
              <Search size={17}/>
              <input
                placeholder="Search name, mobile, category or status…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <select
              className="filter-select"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'Active' | 'Inactive')}
            >
              <option value="all">All status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
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
                      className={`contact-status-button ${contact.status === 'Active' ? 'deactivate' : 'activate'}`}
                      onClick={() => void changeStatus(contact)}
                      disabled={changingStatusId === contact.id}
                      title={contact.status === 'Active' ? 'Deactivate contact' : 'Reactivate contact'}
                    >
                      {contact.status === 'Active' ? <Ban size={15}/> : <CheckCircle2 size={15}/>}
                      {changingStatusId === contact.id
                        ? 'Updating…'
                        : contact.status === 'Active'
                          ? 'Deactivate'
                          : 'Reactivate'}
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
