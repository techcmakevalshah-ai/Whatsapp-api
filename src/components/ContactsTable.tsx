import { Filter, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getFlowluSalesMeta } from '../lib/api';
import { getFlowluOpportunityAudience } from '../lib/flowluAudience';
import type { Contact, ContactSource, FlowluLeadContext, FlowluSalesMeta } from '../types';
import './ContactsTable.flowlu.css';

type FilterMode = 'all' | 'active' | 'inactive';
type OpportunityPresence = 'all' | 'has' | 'none';
type DealStatusFilter = 'all' | 'in_progress' | 'won' | 'lost';

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
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dealStatusFilter, setDealStatusFilter] = useState<DealStatusFilter>('all');
  const [opportunityPresence, setOpportunityPresence] = useState<OpportunityPresence>('all');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
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
      setAssigneeFilter('');
      setSourceFilter('');
      setDealStatusFilter('all');
      setOpportunityPresence('all');
      setMinBudget('');
      setMaxBudget('');
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
        if (active) setAudienceError(err instanceof Error ? err.message : 'Unable to load Flowlu sales filters.');
      });

    return () => { active = false; };
  }, [source]);

  const hasDealFilter = source === 'flowlu' && Boolean(
    pipelineFilter
    || stageFilter
    || assigneeFilter
    || sourceFilter
    || dealStatusFilter !== 'all'
    || minBudget.trim()
    || maxBudget.trim()
    || opportunityPresence !== 'all'
  );

  useEffect(() => {
    if (source !== 'flowlu' || !hasDealFilter) {
      setAudienceIds(null);
      setLeadContexts(new Map());
      setAudienceError('');
      return;
    }

    const min = minBudget.trim() === '' ? undefined : Number(minBudget);
    const max = maxBudget.trim() === '' ? undefined : Number(maxBudget);
    if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
      setAudienceError('Enter a valid budget amount.');
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setAudienceError('Minimum budget cannot be greater than maximum budget.');
      return;
    }

    let active = true;
    setAudienceLoading(true);
    setAudienceError('');

    void getFlowluOpportunityAudience({
      pipelineId: opportunityPresence === 'none' ? undefined : (pipelineFilter ? Number(pipelineFilter) : undefined),
      stageId: opportunityPresence === 'none' ? undefined : (stageFilter ? Number(stageFilter) : undefined),
      assigneeId: opportunityPresence === 'none' ? undefined : (assigneeFilter ? Number(assigneeFilter) : undefined),
      sourceId: opportunityPresence === 'none' ? undefined : (sourceFilter ? Number(sourceFilter) : undefined),
      dealStatus: opportunityPresence === 'none' ? 'all' : dealStatusFilter,
      minBudget: opportunityPresence === 'none' ? undefined : min,
      maxBudget: opportunityPresence === 'none' ? undefined : max,
    })
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
  }, [
    source,
    hasDealFilter,
    pipelineFilter,
    stageFilter,
    assigneeFilter,
    sourceFilter,
    dealStatusFilter,
    opportunityPresence,
    minBudget,
    maxBudget,
  ]);

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

  const sourceNames = useMemo(
    () => new Map((flowluMeta?.sources || []).map((item) => [item.id, item.name])),
    [flowluMeta],
  );

  const statusLabel = (status: FlowluLeadContext['status']) => {
    if (status === 'won') return 'Won';
    if (status === 'lost') return 'Lost';
    return 'In Progress';
  };

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

    let matchesOpportunity = true;
    if (source === 'flowlu' && audienceIds !== null) {
      const linked = contact.flowluId != null && audienceIds.has(contact.flowluId);
      matchesOpportunity = opportunityPresence === 'none' ? !linked : linked;
    }

    return matchesQuery && matchesStatus && matchesCategory && matchesOpportunity;
  }), [contacts, query, statusFilter, categoryFilter, source, audienceIds, opportunityPresence]);

  const activeVisible = filtered.filter((contact) => contact.status === 'Active');
  const allVisibleSelected =
    activeVisible.length > 0 &&
    activeVisible.every((contact) => selected.has(contact.id));

  const clearDealFilters = () => {
    setPipelineFilter('');
    setStageFilter('');
    setAssigneeFilter('');
    setSourceFilter('');
    setDealStatusFilter('all');
    setOpportunityPresence('all');
    setMinBudget('');
    setMaxBudget('');
    setAudienceIds(null);
    setLeadContexts(new Map());
    setAudienceError('');
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    clearDealFilters();
  };

  const setPresence = (value: OpportunityPresence) => {
    setOpportunityPresence(value);
    if (value === 'none') {
      setPipelineFilter('');
      setStageFilter('');
      setAssigneeFilter('');
      setSourceFilter('');
      setDealStatusFilter('all');
      setMinBudget('');
      setMaxBudget('');
    }
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

        {source !== 'flowlu' && (
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
          <option value="all">All contact status</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive</option>
        </select>

        <button className="btn contact-clear-filter" type="button" onClick={clearFilters}>
          <Filter size={14}/> Clear
        </button>
      </div>

      {source === 'flowlu' && (
        <div className="flowlu-smart-builder">
          <div className="flowlu-smart-head">
            <div>
              <span className="flowlu-smart-icon"><SlidersHorizontal size={15}/></span>
              <span><b>Smart Audience</b><small>Filter the selected Flowlu segment using live opportunity data.</small></span>
            </div>
            {hasDealFilter && <button type="button" onClick={clearDealFilters}>Reset deal filters</button>}
          </div>

          <div className="flowlu-smart-grid">
            <label>
              <span>Opportunity</span>
              <select value={opportunityPresence} onChange={(e) => setPresence(e.target.value as OpportunityPresence)} disabled={audienceLoading}>
                <option value="all">All contacts</option>
                <option value="has">Has opportunity</option>
                <option value="none">No opportunity</option>
              </select>
            </label>

            <label>
              <span>Pipeline</span>
              <select
                value={pipelineFilter}
                onChange={(e) => {
                  setPipelineFilter(e.target.value);
                  setStageFilter('');
                }}
                disabled={!flowluMeta || audienceLoading || opportunityPresence === 'none'}
              >
                <option value="">All pipelines</option>
                {(flowluMeta?.pipelines || []).map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Stage</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                disabled={!pipelineFilter || audienceLoading || opportunityPresence === 'none'}
              >
                <option value="">All stages</option>
                {availableStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Assignee</span>
              <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} disabled={!flowluMeta || audienceLoading || opportunityPresence === 'none'}>
                <option value="">All assignees</option>
                {(flowluMeta?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>

            <label>
              <span>Lead Source</span>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} disabled={!flowluMeta || audienceLoading || opportunityPresence === 'none'}>
                <option value="">All sources</option>
                {(flowluMeta?.sources || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <label>
              <span>Deal Status</span>
              <select value={dealStatusFilter} onChange={(e) => setDealStatusFilter(e.target.value as DealStatusFilter)} disabled={audienceLoading || opportunityPresence === 'none'}>
                <option value="all">All deal status</option>
                <option value="in_progress">In Progress</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </label>

            <label>
              <span>Min Budget</span>
              <input type="number" min="0" inputMode="numeric" placeholder="e.g. 1000000" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} disabled={audienceLoading || opportunityPresence === 'none'}/>
            </label>

            <label>
              <span>Max Budget</span>
              <input type="number" min="0" inputMode="numeric" placeholder="e.g. 5000000" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} disabled={audienceLoading || opportunityPresence === 'none'}/>
            </label>
          </div>

          {opportunityPresence === 'none' && (
            <div className="flowlu-smart-help">No Opportunity checks the selected segment against all Flowlu opportunities, so the other deal filters are disabled.</div>
          )}
        </div>
      )}

      {source === 'flowlu' && (hasDealFilter || audienceLoading || audienceError) && (
        <div className={`flowlu-audience-status ${audienceError ? 'error' : ''}`}>
          {audienceLoading
            ? 'Checking Flowlu opportunities for this audience…'
            : audienceError
              ? audienceError
              : <><b>{filtered.length}</b> matching contact{filtered.length === 1 ? '' : 's'} in this loaded segment. Select All will select only these active matches.</>}
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
                          <small>{statusLabel(context.status)}{context.sourceId ? ` · ${sourceNames.get(context.sourceId) || 'Source'}` : ''}{context.budget > 0 ? ` · ₹${context.budget.toLocaleString('en-IN')}` : ''}</small>
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
                    {audienceLoading ? 'Checking Flowlu audience…' : 'No contacts match these filters.'}
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
