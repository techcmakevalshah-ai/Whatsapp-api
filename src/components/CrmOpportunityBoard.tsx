import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Filter,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import {
  createCrmOpportunity,
  createCrmOpportunityComment,
  createCrmStage,
  getCrmOpportunityBoard,
  getCrmOpportunityDetail,
  getCrmWorkspaceMeta,
  searchCrmAccounts,
  updateCrmOpportunity,
  type CrmAccountOption,
  type CrmOpportunityDetail,
} from '../lib/crmWorkspace';
import type { FlowluLeadContext, FlowluSalesMeta } from '../types';
import './CrmOpportunityBoard.css';

type DealFilter = 'in_progress' | 'won' | 'lost' | 'all';

const DEFAULT_STAGE_COLORS = ['#2f9be0', '#9b59c5', '#f0b91c', '#ea8a2d', '#20b7c7', '#23a55a'];

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dateOnly(value: string) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function commentTime(value: string) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TM';
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
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropStageId, setDropStageId] = useState<number | null>(null);

  const [stageColors, setStageColors] = useState<Record<string, string>>(() => {
    try { return JSON.parse(window.localStorage.getItem('crm_stage_colors') || '{}'); } catch { return {}; }
  });
  const [stageOpen, setStageOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ name: '', color: '#2f9be0' });
  const [stageSaving, setStageSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', budget: 0, stageId: 0, assigneeId: 0, sourceId: 0, accountId: 0, accountSearch: '',
  });
  const [accountResults, setAccountResults] = useState<CrmAccountOption[]>([]);
  const [accountSearching, setAccountSearching] = useState(false);

  const [selected, setSelected] = useState<FlowluLeadContext | null>(null);
  const [detail, setDetail] = useState<CrmOpportunityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [lossReasonId, setLossReasonId] = useState(0);
  const [detailEdit, setDetailEdit] = useState({
    name: '', budget: 0, stageId: 0, assigneeId: 0, sourceId: 0, deadline: '', description: '',
  });

  const loadMeta = async () => {
    const data = await getCrmWorkspaceMeta();
    setMeta(data);
    const first = data.pipelines[0]?.id || 0;
    setPipelineId((current) => current && data.pipelines.some((item) => item.id === current) ? current : first);
    return data;
  };

  useEffect(() => {
    setLoading(true);
    loadMeta()
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load CRM setup.'))
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    if (!pipelineId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getCrmOpportunityBoard({
        pipelineId,
        assigneeId: assigneeId || undefined,
        sourceId: sourceId || undefined,
        dealStatus: dealFilter,
      });
      setContexts(data.contexts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [pipelineId, dealFilter, assigneeId, sourceId]);

  const stages = useMemo(
    () => (meta?.stages || []).filter((stage) => stage.pipelineId === pipelineId),
    [meta?.stages, pipelineId],
  );

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return contexts.filter((item) => !search || `${item.leadName} ${item.leadId}`.toLowerCase().includes(search));
  }, [contexts, query]);

  useEffect(() => {
    if (!createOpen || createForm.accountSearch.trim().length < 2) {
      setAccountResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setAccountSearching(true);
      void searchCrmAccounts(createForm.accountSearch)
        .then((data) => setAccountResults(data.accounts || []))
        .catch(() => setAccountResults([]))
        .finally(() => setAccountSearching(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [createOpen, createForm.accountSearch]);

  const stageColor = (stageId: number, index: number) => stageColors[String(stageId)] || DEFAULT_STAGE_COLORS[index % DEFAULT_STAGE_COLORS.length];

  const openCreate = (stageId?: number) => {
    setCreateForm({
      name: '', budget: 0, stageId: stageId || stages[0]?.id || 0,
      assigneeId: 0, sourceId: 0, accountId: 0, accountSearch: '',
    });
    setAccountResults([]);
    setCreateOpen(true);
  };

  const createOpportunity = async () => {
    if (!createForm.name.trim()) return setError('Enter an opportunity name.');
    if (!createForm.stageId) return setError('Choose a stage.');
    setCreateSaving(true);
    setError('');
    try {
      await createCrmOpportunity({
        name: createForm.name.trim(), pipelineId, stageId: createForm.stageId,
        budget: Number(createForm.budget || 0), assigneeId: createForm.assigneeId || undefined,
        sourceId: createForm.sourceId || undefined, accountId: createForm.accountId || undefined,
      });
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create opportunity.');
    } finally {
      setCreateSaving(false);
    }
  };

  const addStage = async () => {
    if (!stageForm.name.trim()) return setError('Enter a stage name.');
    setStageSaving(true);
    setError('');
    try {
      const result = await createCrmStage({ pipelineId, name: stageForm.name.trim(), color: stageForm.color });
      const nextColors = { ...stageColors, [String(result.stage.id)]: stageForm.color };
      setStageColors(nextColors);
      window.localStorage.setItem('crm_stage_colors', JSON.stringify(nextColors));
      setStageForm({ name: '', color: '#2f9be0' });
      setStageOpen(false);
      await loadMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create stage.');
    } finally {
      setStageSaving(false);
    }
  };

  const moveOpportunity = async (leadId: number, nextStageId: number) => {
    const item = contexts.find((row) => row.leadId === leadId);
    if (!item || item.stageId === nextStageId || item.status !== 'in_progress') return;
    const previousStageId = item.stageId;
    setContexts((current) => current.map((row) => row.leadId === leadId ? { ...row, stageId: nextStageId } : row));
    setError('');
    try {
      await updateCrmOpportunity({ id: leadId, pipelineId, stageId: nextStageId });
    } catch (err) {
      setContexts((current) => current.map((row) => row.leadId === leadId ? { ...row, stageId: previousStageId } : row));
      setError(err instanceof Error ? err.message : 'Unable to move opportunity.');
    } finally {
      setDraggingId(null);
      setDropStageId(null);
    }
  };

  const loadDetail = async (item: FlowluLeadContext) => {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    setLossReasonId(0);
    setError('');
    try {
      const data = await getCrmOpportunityDetail(item.leadId);
      setDetail(data);
      setDetailEdit({
        name: data.opportunity.name,
        budget: data.opportunity.budget,
        stageId: data.opportunity.stageId || 0,
        assigneeId: data.opportunity.assigneeId || 0,
        sourceId: data.opportunity.sourceId || 0,
        deadline: data.opportunity.deadline ? data.opportunity.deadline.slice(0, 10) : '',
        description: data.opportunity.description || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load opportunity details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!selected) return;
    const data = await getCrmOpportunityDetail(selected.leadId);
    setDetail(data);
    setDetailEdit({
      name: data.opportunity.name,
      budget: data.opportunity.budget,
      stageId: data.opportunity.stageId || 0,
      assigneeId: data.opportunity.assigneeId || 0,
      sourceId: data.opportunity.sourceId || 0,
      deadline: data.opportunity.deadline ? data.opportunity.deadline.slice(0, 10) : '',
      description: data.opportunity.description || '',
    });
  };

  const saveDetail = async () => {
    if (!selected) return;
    setDetailSaving(true);
    setError('');
    try {
      await updateCrmOpportunity({
        id: selected.leadId,
        name: detailEdit.name,
        pipelineId,
        stageId: detailEdit.stageId,
        budget: Number(detailEdit.budget || 0),
        assigneeId: detailEdit.assigneeId || null,
        sourceId: detailEdit.sourceId || null,
        deadline: detailEdit.deadline,
        description: detailEdit.description,
      });
      await Promise.all([refresh(), refreshDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save opportunity.');
    } finally {
      setDetailSaving(false);
    }
  };

  const setDetailStage = async (stageId: number) => {
    if (!selected || stageId === detailEdit.stageId) return;
    setDetailEdit((current) => ({ ...current, stageId }));
    try {
      await updateCrmOpportunity({ id: selected.leadId, pipelineId, stageId });
      await Promise.all([refresh(), refreshDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to move opportunity.');
    }
  };

  const statusAction = async (action: 'won' | 'lost' | 'reopen') => {
    if (!selected || !detail) return;
    if (action === 'lost' && !lossReasonId) return setError('Choose a loss reason before marking this opportunity Lost.');
    setDetailSaving(true);
    setError('');
    try {
      await updateCrmOpportunity({
        id: selected.leadId,
        opportunityAction: action,
        lossReasonId: action === 'lost' ? lossReasonId : undefined,
      });
      await Promise.all([refresh(), refreshDetail()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update opportunity status.');
    } finally {
      setDetailSaving(false);
    }
  };

  const postComment = async () => {
    if (!selected || !commentText.trim()) return;
    setCommentSaving(true);
    setError('');
    try {
      await createCrmOpportunityComment(selected.leadId, commentText.trim());
      setCommentText('');
      await refreshDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add comment.');
    } finally {
      setCommentSaving(false);
    }
  };

  const selectedPipelineName = meta?.pipelines.find((item) => item.id === pipelineId)?.name || 'Pipeline';

  return (
    <section className="crm-v3">
      <header className="crm-v3-head">
        <div>
          <div className="eyebrow"><BriefcaseBusiness size={15}/> CRM OPPORTUNITIES</div>
          <h1>Opportunities</h1>
          <p>Drag cards between stages, create stages and keep the whole team conversation on the opportunity.</p>
        </div>
        <div className="crm-v3-actions">
          <label><span>Pipeline</span><div><select value={pipelineId} onChange={(event) => setPipelineId(Number(event.target.value))}>{(meta?.pipelines || []).map((pipeline) => <option value={pipeline.id} key={pipeline.id}>{pipeline.name}</option>)}</select><ChevronDown size={14}/></div></label>
          <button className="stage-btn" onClick={() => setStageOpen(true)}><Plus size={16}/> Stage</button>
          <button className="create-btn" onClick={() => openCreate()}><Plus size={17}/> Create Opportunity</button>
          <button className="refresh-btn" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/></button>
        </div>
      </header>

      <nav className="crm-v3-tabs">
        {([['in_progress','Active'],['won','Won'],['lost','Lost'],['all','All Opportunities']] as const).map(([value,label]) => <button key={value} className={dealFilter === value ? 'active' : ''} onClick={() => setDealFilter(value)}>{label}</button>)}
      </nav>

      {error && <div className="crm-v3-error">{error}</div>}

      <div className="crm-v3-toolbar">
        <label className="search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search opportunities"/></label>
        <button className="filter" title="Filters"><Filter size={17}/></button>
        <select value={assigneeId} onChange={(event) => setAssigneeId(Number(event.target.value))}><option value={0}>All assignees</option>{(meta?.users || []).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select>
        <select value={sourceId} onChange={(event) => setSourceId(Number(event.target.value))}><option value={0}>All sources</option>{(meta?.sources || []).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select>
        <span className="count">{visible.length} opportunities</span>
      </div>

      {loading && !contexts.length ? <div className="crm-v3-empty">Loading opportunities…</div> : !pipelineId ? <div className="crm-v3-empty">No active CRM pipeline was found.</div> : (
        <div className="crm-v3-board">
          {stages.map((stage, index) => {
            const cards = visible.filter((item) => item.stageId === stage.id);
            const total = cards.reduce((sum, item) => sum + Number(item.budget || 0), 0);
            const color = stageColor(stage.id, index);
            return (
              <section
                className={`crm-v3-column ${dropStageId === stage.id ? 'drop-target' : ''}`}
                key={stage.id}
                style={{ '--stage-color': color } as React.CSSProperties}
                onDragOver={(event) => { if (draggingId) { event.preventDefault(); setDropStageId(stage.id); } }}
                onDragLeave={() => setDropStageId((current) => current === stage.id ? null : current)}
                onDrop={(event) => { event.preventDefault(); if (draggingId) void moveOpportunity(draggingId, stage.id); }}
              >
                <header>
                  <div><strong>{stage.name}</strong><span>{cards.length} {cards.length === 1 ? 'Opportunity' : 'Opportunities'}</span><b>₹{money(total)}</b></div>
                  <button onClick={() => openCreate(stage.id)} title={`Create in ${stage.name}`}><Plus size={17}/></button>
                </header>
                <div className="crm-v3-column-list">
                  {cards.map((item) => {
                    const owner = meta?.users.find((user) => user.id === item.assigneeId)?.name || 'Unassigned';
                    const source = meta?.sources.find((src) => src.id === item.sourceId)?.name || '';
                    return (
                      <article
                        key={item.leadId}
                        draggable={item.status === 'in_progress'}
                        className={`crm-v3-card ${item.status} ${draggingId === item.leadId ? 'dragging' : ''}`}
                        onDragStart={(event) => { setDraggingId(item.leadId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(item.leadId)); }}
                        onDragEnd={() => { setDraggingId(null); setDropStageId(null); }}
                        onClick={() => { if (!draggingId) void loadDetail(item); }}
                      >
                        <div className="crm-v3-card-top"><strong>{item.leadName}</strong><span>#{item.leadId}</span></div>
                        <b className="budget">₹{money(item.budget)}</b>
                        <div className="crm-v3-card-meta"><span><UserRound size={13}/>{owner}</span>{source && <span>{source}</span>}</div>
                        <div className="crm-v3-card-foot"><small className={`deal-status ${item.status}`}>{item.status === 'in_progress' ? 'Active' : item.status === 'won' ? 'Won' : 'Lost'}</small>{item.accountId > 0 && <span>Contact #{item.accountId}</span>}</div>
                      </article>
                    );
                  })}
                  {!cards.length && <div className="crm-v3-column-empty">Drop an opportunity here</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {stageOpen && (
        <div className="crm-v3-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setStageOpen(false)}>
          <section className="crm-v3-modal compact">
            <header><div><small>{selectedPipelineName}</small><h2>Create Stage</h2></div><button onClick={() => setStageOpen(false)}><X size={18}/></button></header>
            <div className="crm-v3-modal-body">
              <label>Stage name<input autoFocus value={stageForm.name} onChange={(event) => setStageForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Documentation"/></label>
              <label>Stage colour<div className="color-field"><input type="color" value={stageForm.color} onChange={(event) => setStageForm((current) => ({ ...current, color: event.target.value }))}/><span style={{ background: stageForm.color }}/><b>{stageForm.color}</b></div></label>
              <div className="stage-preview" style={{ '--stage-color': stageForm.color } as React.CSSProperties}><strong>{stageForm.name || 'New stage'}</strong><span>0 Opportunities</span></div>
              <button className="primary-action" disabled={stageSaving} onClick={() => void addStage()}>{stageSaving ? 'Creating…' : 'Create Stage'}</button>
            </div>
          </section>
        </div>
      )}

      {createOpen && (
        <div className="crm-v3-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}>
          <section className="crm-v3-modal">
            <header><div><small>{selectedPipelineName}</small><h2>Create Opportunity</h2></div><button onClick={() => setCreateOpen(false)}><X size={18}/></button></header>
            <div className="crm-v3-modal-body form-grid">
              <label className="wide">Opportunity name<input autoFocus value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Hetalkumar Patel HUF"/></label>
              <label>Stage<select value={createForm.stageId} onChange={(event) => setCreateForm((current) => ({ ...current, stageId: Number(event.target.value) }))}>{stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
              <label>Amount / Budget<input type="number" min={0} value={createForm.budget} onChange={(event) => setCreateForm((current) => ({ ...current, budget: Number(event.target.value) }))}/></label>
              <label>Owner<select value={createForm.assigneeId} onChange={(event) => setCreateForm((current) => ({ ...current, assigneeId: Number(event.target.value) }))}><option value={0}>Unassigned</option>{(meta?.users || []).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label>
              <label>Source<select value={createForm.sourceId} onChange={(event) => setCreateForm((current) => ({ ...current, sourceId: Number(event.target.value) }))}><option value={0}>No source</option>{(meta?.sources || []).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
              <label className="wide account-search">Link Flowlu contact / company<input value={createForm.accountSearch} onChange={(event) => setCreateForm((current) => ({ ...current, accountSearch: event.target.value, accountId: 0 }))} placeholder="Type at least 2 letters to search"/>{accountSearching && <small>Searching…</small>}{accountResults.length > 0 && <div className="account-results">{accountResults.map((account) => <button key={account.id} onClick={() => { setCreateForm((current) => ({ ...current, accountId: account.id, accountSearch: account.name })); setAccountResults([]); }}><b>{account.name}</b><span>{account.phone || account.email || `#${account.id}`}</span></button>)}</div>}{createForm.accountId > 0 && <div className="selected-account">Linked to Flowlu account #{createForm.accountId}</div>}</label>
              <button className="primary-action wide" disabled={createSaving} onClick={() => void createOpportunity()}>{createSaving ? 'Creating…' : 'Create Opportunity'}</button>
            </div>
          </section>
        </div>
      )}

      {selected && (
        <div className="crm-v3-detail-backdrop">
          <section className="crm-v3-detail">
            <header className="detail-topbar">
              <div><button className="back" onClick={() => { setSelected(null); setDetail(null); }}><ArrowLeft size={20}/></button><div><small>Opportunity #{selected.leadId}</small><h2>{detail?.opportunity.name || selected.leadName}</h2></div></div>
              <div><button className="save-detail" disabled={detailSaving || detailLoading} onClick={() => void saveDetail()}><Save size={16}/>{detailSaving ? 'Saving…' : 'Save'}</button><button className="close" onClick={() => { setSelected(null); setDetail(null); }}><X size={19}/></button></div>
            </header>

            {detailLoading || !detail ? <div className="detail-loading">Loading opportunity workspace…</div> : (
              <>
                <div className="detail-tabs"><button className="active">Main</button><button>Activity Feed</button><button>Notes</button></div>
                <div className="detail-pipeline-name">{selectedPipelineName}</div>
                <div className="detail-stage-ribbon">
                  {stages.map((stage, index) => <button key={stage.id} className={detailEdit.stageId === stage.id ? 'active' : ''} style={{ '--stage-color': stageColor(stage.id, index) } as React.CSSProperties} onClick={() => void setDetailStage(stage.id)}>{stage.name}</button>)}
                </div>

                <div className="detail-summary">
                  <div><CircleDollarSign size={22}/><span><small>Amount</small><b>₹{money(detailEdit.budget)}</b></span></div>
                  <div><CalendarDays size={22}/><span><small>Time Frames</small><b>{dateOnly(detail.opportunity.startDate)} → {dateOnly(detailEdit.deadline)}</b></span></div>
                  <div><BriefcaseBusiness size={22}/><span><small>Source</small><b>{meta?.sources.find((item) => item.id === detailEdit.sourceId)?.name || 'Not set'}</b></span></div>
                  <div><UserRound size={22}/><span><small>Owner</small><b>{meta?.users.find((item) => item.id === detailEdit.assigneeId)?.name || 'Unassigned'}</b></span></div>
                </div>

                <div className="detail-layout">
                  <aside className="detail-left">
                    <section className="detail-section">
                      <h3>Customer</h3>
                      {detail.account ? <div className="customer-card"><span className="customer-avatar">{initials(detail.account.name)}</span><div><b>{detail.account.name}</b><a>{detail.account.phone || detail.account.email || `Flowlu #${detail.account.id}`}</a></div></div> : <div className="empty-customer">No contact linked to this opportunity.</div>}
                    </section>

                    <section className="detail-section">
                      <h3>About the opportunity</h3>
                      <label>Name<input value={detailEdit.name} onChange={(event) => setDetailEdit((current) => ({ ...current, name: event.target.value }))}/></label>
                      <div className="two-fields"><label>Amount<input type="number" min={0} value={detailEdit.budget} onChange={(event) => setDetailEdit((current) => ({ ...current, budget: Number(event.target.value) }))}/></label><label>End Date<input type="date" value={detailEdit.deadline} onChange={(event) => setDetailEdit((current) => ({ ...current, deadline: event.target.value }))}/></label></div>
                      <label>Owner<select value={detailEdit.assigneeId} onChange={(event) => setDetailEdit((current) => ({ ...current, assigneeId: Number(event.target.value) }))}><option value={0}>Unassigned</option>{(meta?.users || []).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label>
                      <label>Source<select value={detailEdit.sourceId} onChange={(event) => setDetailEdit((current) => ({ ...current, sourceId: Number(event.target.value) }))}><option value={0}>No source</option>{(meta?.sources || []).map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
                      <label>Description<textarea rows={4} value={detailEdit.description} onChange={(event) => setDetailEdit((current) => ({ ...current, description: event.target.value }))}/></label>
                    </section>

                    <section className="detail-section outcome-box">
                      <h3>Opportunity outcome</h3>
                      {detail.opportunity.status === 'in_progress' ? <><label>Loss reason<select value={lossReasonId} onChange={(event) => setLossReasonId(Number(event.target.value))}><option value={0}>Select only when marking Lost</option>{detail.lossReasons.map((reason) => <option value={reason.id} key={reason.id}>{reason.name}</option>)}</select></label><div className="outcome-actions"><button className="won" onClick={() => void statusAction('won')}>Mark Won</button><button className="lost" onClick={() => void statusAction('lost')}>Mark Lost</button></div></> : <button className="reopen" onClick={() => void statusAction('reopen')}>Reopen Opportunity</button>}
                    </section>
                  </aside>

                  <main className="detail-feed">
                    <div className="feed-composer">
                      <div className="feed-avatar">{initials(meta?.users.find((item) => item.id === detailEdit.assigneeId)?.name || 'Team')}</div>
                      <div><textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Comment for your team or add an update…" rows={3}/><button disabled={commentSaving || !commentText.trim()} onClick={() => void postComment()}><Send size={15}/>{commentSaving ? 'Posting…' : 'Post Comment'}</button></div>
                    </div>
                    <div className="planned-strip"><span>Planned</span><p>Comments and team updates for this opportunity appear below.</p></div>
                    <div className="comment-feed">
                      {detail.comments.map((comment) => {
                        const author = comment.authorName || meta?.users.find((user) => user.id === comment.authorId)?.name || 'Team Member';
                        return <article key={`${comment.id}-${comment.createdAt}`}><span className="comment-avatar">{initials(author)}</span><div><header><b>{author}</b><small>{commentTime(comment.createdAt)}</small></header><p>{comment.text}</p></div></article>;
                      })}
                      {!detail.comments.length && <div className="no-comments"><MessageSquare size={28}/><b>No comments yet</b><span>Post the first team update for this opportunity.</span></div>}
                    </div>
                  </main>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
