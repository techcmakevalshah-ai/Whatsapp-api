import { Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Contact } from '../types';

type FilterMode = 'all' | 'active' | 'inactive';

export function ContactsTable({ contacts, selected, onToggle, onToggleAll, query, setQuery }: {
  contacts: Contact[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<FilterMode>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(
    () => [...new Set(contacts.map((contact) => contact.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [contacts],
  );

  const filtered = useMemo(() => contacts.filter((contact) => {
    const matchesQuery = `${contact.name} ${contact.phone} ${contact.category}`
      .toLowerCase()
      .includes(query.toLowerCase());

    const matchesStatus =
      statusFilter === 'all'
      || (statusFilter === 'active' && contact.status === 'Active')
      || (statusFilter === 'inactive' && contact.status === 'Inactive');

    const matchesCategory =
      categoryFilter === 'all' || contact.category === categoryFilter;

    return matchesQuery && matchesStatus && matchesCategory;
  }), [contacts, query, statusFilter, categoryFilter]);

  const activeVisible = filtered.filter((contact) => contact.status === 'Active');
  const allVisibleSelected =
    activeVisible.length > 0 &&
    activeVisible.every((contact) => selected.has(contact.id));

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
  };

  return (
    <section className="card contacts-card">
      <div className="section-title"><span className="step blue">2</span> Contacts from Google Sheet</div>

      <div className="toolbar contact-filter-toolbar">
        <div className="search">
          <Search size={17}/>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, mobile or category…"
          />
        </div>

        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FilterMode)}
        >
          <option value="all">All status</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive</option>
        </select>

        <button className="btn contact-clear-filter" type="button" onClick={clearFilters}>
          <Filter size={14}/> Clear
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => onToggleAll(activeVisible.map((contact) => contact.id))}
                />
              </th>
              <th>Name</th>
              <th>Mobile Number</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(contact.id)}
                    onChange={() => onToggle(contact.id)}
                    disabled={contact.status !== 'Active'}
                  />
                </td>
                <td className="linkish">{contact.name}</td>
                <td>+{contact.phone}</td>
                <td>{contact.category}</td>
                <td>
                  <span className={`pill ${contact.status === 'Active' ? 'ok' : 'muted'}`}>
                    {contact.status}
                  </span>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5}><div className="contacts-empty">No contacts match these filters.</div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-summary">
        <b>{selected.size}</b> selected · {filtered.length} shown · {contacts.length} total
        <span>Select All applies only to filtered active contacts.</span>
      </div>
    </section>
  );
}
