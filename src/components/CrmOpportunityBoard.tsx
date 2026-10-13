import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, Filter, RefreshCw, Search, X } from 'lucide-react';
import { getFlowluSalesMeta } from '../lib/api';
import { getFlowluOpportunityBoard } from '../lib/flowluOpportunityBoard';
import { updateFlowluOpportunity } from '../lib/flowluOpportunityControl';
import type { FlowluLeadContext, FlowluSalesMeta } from '../types';
import './CrmOpportunityBoard.css';

type DealFilter = 'in_progress' | 'won' | 'lost' | 'all';

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function CrmOpportunityBoard() {
  const [meta, setMeta] = useState<FlowluSalesMeta | null>(null);
  const [pipelineId, setPipelineId] = useState(0);
  const [contexts, setContexts] = useState<FlowluLeadContext[]>([]);
  const [dealFilter, setDealFilter] = useState<DealFilter>('in_progress');
  const [assigneeId, setAssigneeId] = useState(0);
  const [sourceId, setSourceId] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<FlowluLeadContext | null>(null);
  const [working, setWorking] = useState(false);
  const [edit, setEdit] = useState({ stageId: 0, assigneeId: 0, sourceId: 0, budget: 0 });

  useEffect(() => {
    setLoading(true);
    getFlowluSalesMeta()
      .then((data) => {
        setMeta(data);
        const first = data.pipelines[0]?.id || 0;
        setPipelineId((current) => current || first);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load CRM setup.'))
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    if (!pipelineId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getFlowluOpportunityBoard({ pipelineId, assigneeId: assigneeId || undefined, sourceId: sourceId || undefined, dealStatus: dealFilter });
      setContexts(data.contexts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [pipelineId, dealFilter, assigneeId, sourceId]);

  useEffect(() => {
    if (!selected) return;
    setEdit({ stageId: selected.stageId || 0, assigneeId: selected.assigneeId || 0, sourceId: selected.sourceId || 0, budget: selected.budget || 0 });
  }, [selected?.leadId]);

  const stages = useMemo(() => (meta?.stages || []).filter((stage) => stage.pipelineId === pipelineId), [meta?.stages, pipelineId]);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return contexts.filter((item) => !search || `${item.leadName} ${item.leadId}`.toLowerCase().includes(search));
  }, [contexts, query]);

  const save = async () => {
    if (!selected) return;
    setWorking(true);
    setError('');
    try {
      await updateFlowluOpportunity({ id: selected.leadId, pipelineId, stageId: edit.stageId || undefined, assigneeId: edit.assigneeId || null, sourceId: edit.sourceId || null, budget: Number(edit.budget || 0) });
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update opportunity.');
    } finally { setWorking(false); }
  };

  const statusAction = async (action: 'won' | 'lost' | 'reopen') => {
    if (!selected) return;
    setWorking(true);
    try {
      await updateFlowluOpportunity({ id: selected.leadId, opportunityAction: action });
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update opportunity status.');
    } finally { setWorking(false); }
  };

  return (
    <section className="crm-v2">
      <header className="crm-v2-head">
        <div><div className="eyebrow"><BriefcaseBusiness size={15}/> CRM PIPELINE</div><h1>Opportunities</h1><p>CRM pipelines and sales stages are separate from task workflows.</p></div>
        <div className="crm-v2-actions"><label><span>Pipeline</span><div><select value={pipelineId} onChange={(event) => setPipelineId(Number(event.target.value))}>{(meta?.pipelines || []).map((pipeline) => <option value={pipeline.id} key={pipeline.id}>{pipeline.name}</option>)}</select><ChevronDown size={14}/></div></label><button onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> Refresh</button></div>
      </header>

      <nav className="crm-v2-tabs">
        {([['in_progress','Active'],['won','Won'],['lost','Lost'],['all','All Opportunities']] as const).map(([value,label]) => <button key={value} className={dealFilter === value ? 'active' : ''} onClick={() => setDealFilter(value)}>{label}</button>)}
      </nav>

      {error && <div className="crm-v2-error">{error}</div>}

      <div className="crm-v2-toolbar">
        <label className="search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search opportunities"/></label>
        <button className="filter"><Filter size={17}/></button>
        <select value={assigneeId} onChange={(event) => setAssigneeId(Number(event.target.value))}><option value={0}>All assignees</option>{(meta?.users || []).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select>
        <select value={sourceId} onChange={(event) => setSourceId(Number(event.target.value))}><option value={0}>All sources</option>{(meta?.sources || []).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select>
        <span className="count">{visible.length} opportunities</span>
      </div>

      {loading && !contexts.length ? <div className="crm-v2-empty">Loading opportunities…</div> : !pipelineId ? <div className="crm-v2-empty">No active CRM pipeline was found.</div> : (
        <div className="crm-v2-board">
          {stages.map((stage, index) => {
            const cards = visible.filter((item) => item.stageId === stage.id);
            const total = cards.reduce((sum, item) => sum + Number(item.budget || 0), 0);
            return <section className={`crm-v2-column tone-${index % 5}`} key={stage.id}><header><div><strong>{stage.name}</strong><span>{cards.length} {cards.length === 1 ? 'opportunity' : 'opportunities'}</span></div><b>₹{money(total)}</b></header><div className="crm-v2-column-list">{cards.map((item) => { const assignee = meta?.users.find((user) => user.id === item.assigneeId)?.name || 'Unassigned'; const source = meta?.sources.find((src) => src.id === item.sourceId)?.name || ''; return <article key={item.leadId} className={`crm-v2-card ${item.status}`} onClick={() => setSelected(item)}><div className="crm-v2-card-top"><strong>{item.leadName}</strong><span>#{item.leadId}</span></div><b className="budget">₹{money(item.budget)}</b><div className="crm-v2-card-meta"><span>{assignee}</span>{source && <span>{source}</span>}</div><small className={`deal-status ${item.status}`}>{item.status === 'in_progress' ? 'Active' : item.status === 'won' ? 'Won' : 'Lost'}</small></article>; })}{!cards.length && <div className="crm-v2-column-empty">No opportunities</div>}</div></section>;
          })}
        </div>
      )}

      {selected && <div className="crm-v2-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="crm-v2-drawer"><header><div><small>Opportunity #{selected.leadId}</small><h2>{selected.leadName}</h2></div><button onClick={() => setSelected(null)}><X size={18}/></button></header><div className="crm-v2-form"><label>Pipeline<select value={pipelineId} disabled>{(meta?.pipelines || []).map((pipeline) => <option value={pipeline.id} key={pipeline.id}>{pipeline.name}</option>)}</select></label><label>Stage<select value={edit.stageId} onChange={(event) => setEdit((current) => ({ ...current, stageId: Number(event.target.value) }))}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label><label>Budget<input type="number" min={0} value={edit.budget} onChange={(event) => setEdit((current) => ({ ...current, budget: Number(event.target.value) }))}/></label><label>Assignee<select value={edit.assigneeId} onChange={(event) => setEdit((current) => ({ ...current, assigneeId: Number(event.target.value) }))}><option value={0}>Unassigned</option>{(meta?.users || []).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label><label>Source<select value={edit.sourceId} onChange={(event) => setEdit((current) => ({ ...current, sourceId: Number(event.target.value) }))}><option value={0}>No source</option>{(meta?.sources || []).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label><button className="save" disabled={working} onClick={() => void save()}>{working ? 'Saving…' : 'Save Changes'}</button></div><div className="crm-v2-outcome">{selected.status === 'in_progress' ? <><button className="won" disabled={working} onClick={() => void statusAction('won')}>Mark Won</button><button className="lost" disabled={working} onClick={() => void statusAction('lost')}>Mark Lost</button></> : <button disabled={working} onClick={() => void statusAction('reopen')}>Reopen Opportunity</button>}</div></aside></div>}
    </section>
  );
}
