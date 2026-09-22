import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Contact } from '../types';

type FilterMode = 'all' | 'eligible' | 'opted' | 'inactive';

export function ContactsTable({ contacts, selected, onToggle, onToggleAll, query, setQuery }: {
  contacts: Contact[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
}) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const filtered = useMemo(() => contacts.filter((contact) => {
    const matchesQuery = `${contact.name} ${contact.phone} ${contact.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'all'
      || (filter === 'eligible' && contact.optIn && contact.status === 'Active')
      || (filter === 'opted' && contact.optIn)
      || (filter === 'inactive' && contact.status === 'Inactive');
    return matchesQuery && matchesFilter;
  }), [contacts, query, filter]);

  const eligibleVisible = filtered.filter((contact) => contact.optIn && contact.status === 'Active');
  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every((contact) => selected.has(contact.id));

  return (
    <section className="card contacts-card">
      <div className="section-title"><span className="step blue">2</span> Contacts from Google Sheet</div>
      <div className="toolbar">
        <div className="search"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, mobile or category…"/></div>
        <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)}>
          <option value="all">All contacts</option>
          <option value="eligible">Eligible only</option>
          <option value="opted">Opted-in</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={() => onToggleAll(eligibleVisible.map((c) => c.id))}/></th><th>Name</th><th>Mobile Number</th><th>Category</th><th>Opt-In</th><th>Status</th></tr></thead>
          <tbody>{filtered.map((contact) => (
            <tr key={contact.id}>
              <td><input type="checkbox" checked={selected.has(contact.id)} onChange={() => onToggle(contact.id)} disabled={!contact.optIn || contact.status !== 'Active'}/></td>
              <td className="linkish">{contact.name}</td><td>+{contact.phone}</td><td>{contact.category}</td>
              <td><span className={`pill ${contact.optIn ? 'ok' : 'bad'}`}>{contact.optIn ? 'Yes' : 'No'}</span></td>
              <td><span className={`pill ${contact.status === 'Active' ? 'ok' : 'muted'}`}>{contact.status}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="table-summary"><b>{selected.size}</b> selected · {filtered.length} shown · {contacts.length} total <span>Only active, opted-in contacts can be selected.</span></div>
    </section>
  );
}
