import { Filter, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getFlowluSalesMeta } from '../lib/api';
import { getFlowluOpportunityAudience } from '../lib/flowluAudience';
import type { Contact, ContactSource, FlowluLeadContext, FlowluSalesMeta } from '../types';
import './ContactsTable.flowlu.css';

type FilterMode = 'all' | 'active' | 'inactive';

export function ContactsTable({ contacts, source, selected, onToggle, onToggleAll, query, setQuery }: {
  contacts: Contact[];
  source: ContactSource;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<FilterMode>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [flowluMeta, setFlowluMeta] = useState<FlowluSalesMeta | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [audienceIds, setAudienceIds] = useState<Set<number> | null>(null);
  const [leadContexts, setLeadContexts] = useState<Map<number, FlowluLeadContext>>(new Map());
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceError, setAudienceError] = useState('');

  const categories = useMemo(
    () => [...new Set(contacts.map((contact) => contact.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [contacts],
  );

  useEffect(() => {
    if (source !== 'flowlu') {
      setFlowluMeta(null);
      setPipelineFilter('');
      setStageFilter('');
      setAudienceIds(null);
      setLeadContexts(new Map());
      setAudienceError('');
      return;
    }

    let active = true;
    void getFlowluSalesMeta()
      .then((data) => {
        if (active) setFlowluMeta(data);
      })
      .catch((err) => {
        if (active) setAudienceError(err instanceof Error ? err.message : 'Unable to load Flowlu pipelines.');
      });

    return () => { active = false; };
  }, [source]);

  useEffect(() => {
    if (source !== 'flowlu' || !pipelineFilter) {
      setAudienceIds(null);
      setLeadContexts(new Map());
      setAudienceError('');
      return;
    }

    let active = true;
    setAudienceLoading(true);
    setAudienceError('');

    void getFlowluOpportunityAudience(
      Number(pipelineFilter),
      stageFilter ? Number(stageFilter) : undefined,
    )
      .then((data) => {
        if (!active) return;
        setAudienceIds(new Set(data.accountIds));
        setLeadContexts(new Map(data.contexts.map((context) => [context.accountId, context])));
      })
      .catch((err) => {
        if (!active) return;
        setAudienceIds(new Set());
        setLeadContexts(new Map());
        setAudienceError(err instanceof Error ? err.message : 'Unable to filter Flowlu opportunities.');
      })
      .finally(() => {
        if (active) setAudienceLoading(false);
      });

    return () => { active = false; };
  }, [source, pipelineFilter, stageFilter]);

  const availableStages = useMemo(
    () => (flowluMeta?.stages || []).filter(
      (stage) => !pipelineFilter || String(stage.pipelineId || '') === pipelineFilter,
    ),
    [flowluMeta, pipelineFilter],
  );

  const stageNames = useMemo(
    () => new Map((flowluMeta?.stages || []).map((stage) => [stage.id, stage.name])),
    [flowluMeta],
  );

  const filtered = useMemo(() => contacts.filter((contact) => {
    const matchesQuery = `${contact.name} ${contact.phone} ${contact.category}`
      .toLowerCase()
      .includes(query.toLowerCase());

    const matchesStatus =
      statusFilter === 'all'
      || (statusFilter === 'active' && contact.status === 'Active')
      || (statusFilter === 'inactive' && contact.status === 'Inactive');

    const matchesCategory = source === 'flowlu'
      ? true
      : categoryFilter === 'all' || contact.category === categoryFilter;

    const matchesOpportunity = source !== 'flowlu'
      || audienceIds === null
      || (contact.flowluId != null && audienceIds.has(contact.flowluId));

    return matchesQuery && matchesStatus && matchesCategory && matchesOpportunity;
  }), [contacts, query, statusFilter, categoryFilter, source, audienceIds]);

  const activeVisible = filtered.filter((contact) => contact.status === 'Active');
  const allVisibleSelected =
    activeVisible.length > 0 &&
    activeVisible.every((contact) => selected.has(contact.id));

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setPipelineFilter('');
    setStageFilter('');
    setAudienceIds(null);
    setLeadContexts(new Map());
    setAudienceError('');
  };

  return (
    <section className="card contacts-card">
      <div className="section-title"><span className="step blue">2</span> Contacts from {source === 'flowlu' ? 'Flowlu CRM' : 'Excel Sheet'}</div>

      <div className="toolbar contact-filter-toolbar">
        <div className="search">
          <Search size={17}/>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, mobile or category…"
          />
        </div>

        {source === 'flowlu' ? (
          <>
            <select
              className="filter-select"
              value={pipelineFilter}
              onChange={(e) => {
                setPipelineFilter(e.target.value);
                setStageFilter('');
              }}
              disabled={!flowluMeta || audienceLoading}
            >
              <option value="">All pipelines</option>
              {(flowluMeta?.pipelines || []).map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              disabled={!pipelineFilter || audienceLoading}
            >
              <option value="">All stages</option>
              {availableStages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </>
        ) : (
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
        )}

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

      {source === 'flowlu' && (pipelineFilter || audienceLoading || audienceError) && (
        <div className={`flowlu-audience-status ${audienceError ? 'error' : ''}`}>
          {audienceLoading
            ? 'Loading contacts linked to this Flowlu pipeline/stage…'
            : audienceError
              ? audienceError
              : `${filtered.length} loaded segment contact${filtered.length === 1 ? '' : 's'} match this opportunity filter.`}
        </div>
      )}

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
              <th>{source === 'flowlu' ? 'Segment' : 'Category'}</th>
              {source === 'flowlu' && <th>Opportunity</th>}
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((contact) => {
              const context = contact.flowluId ? leadContexts.get(contact.flowluId) : undefined;
              return (
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
                  {source === 'flowlu' && (
                    <td>
                      {context ? (
                        <span className="flowlu-lead-context">
                          <b>{context.leadName}</b>
                          <small>{context.stageId ? stageNames.get(context.stageId) || 'Flowlu stage' : 'Pipeline opportunity'}</small>
                        </span>
                      ) : (
                        <span className="muted-text">—</span>
                      )}
                    </td>
                  )}
                  <td>
                    <span className={`pill ${contact.status === 'Active' ? 'ok' : 'muted'}`}>
                      {contact.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={source === 'flowlu' ? 6 : 5}>
                  <div className="contacts-empty">
                    {audienceLoading ? 'Loading Flowlu opportunity contacts…' : 'No contacts match these filters.'}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-summary">
        <b>{selected.size}</b> selected · {filtered.length} shown · {contacts.length} loaded in segment
        <span>Select All applies only to filtered active contacts.</span>
      </div>
    </section>
  );
}
