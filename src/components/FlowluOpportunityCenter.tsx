import { BriefcaseBusiness, CheckCircle2, RefreshCw, RotateCcw, Save, Trophy, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getFlowluSalesMeta } from '../lib/api';
import { getFlowluContactOpportunities, updateFlowluOpportunity } from '../lib/flowluOpportunityControl';
import type { Contact, FlowluLossReason, FlowluOpportunity, FlowluSalesMeta } from '../types';
import './FlowluOpportunityCenter.css';

function statusLabel(active: number) {
  if (active === 3) return 'Won';
  if (active === 2) return 'Lost';
  return 'In Progress';
}

function statusClass(active: number) {
  if (active === 3) return 'won';
  if (active === 2) return 'lost';
  return 'active';
}

function OpportunityEditor({
  opportunity,
  meta,
  lossReasons,
  onChanged,
}: {
  opportunity: FlowluOpportunity;
  meta: FlowluSalesMeta;
  lossReasons: FlowluLossReason[];
  onChanged: (opportunity: FlowluOpportunity) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lossReasonId, setLossReasonId] = useState(opportunity.closingStatusId ? String(opportunity.closingStatusId) : '');
  const [closingComment, setClosingComment] = useState(opportunity.closingComment || '');
  const [form, setForm] = useState({
    name: opportunity.name,
    pipelineId: opportunity.pipelineId ? String(opportunity.pipelineId) : '',
    stageId: opportunity.stageId ? String(opportunity.stageId) : '',
    sourceId: opportunity.sourceId ? String(opportunity.sourceId) : '',
    assigneeId: opportunity.assigneeId ? String(opportunity.assigneeId) : '',
    budget: String(opportunity.budget || ''),
    deadline: opportunity.deadline || '',
    description: opportunity.description || '',
  });

  useEffect(() => {
    setForm({
      name: opportunity.name,
      pipelineId: opportunity.pipelineId ? String(opportunity.pipelineId) : '',
      stageId: opportunity.stageId ? String(opportunity.stageId) : '',
      sourceId: opportunity.sourceId ? String(opportunity.sourceId) : '',
      assigneeId: opportunity.assigneeId ? String(opportunity.assigneeId) : '',
      budget: String(opportunity.budget || ''),
      deadline: opportunity.deadline || '',
      description: opportunity.description || '',
    });
    setLossReasonId(opportunity.closingStatusId ? String(opportunity.closingStatusId) : '');
    setClosingComment(opportunity.closingComment || '');
    setError('');
    setSuccess('');
  }, [opportunity.id, opportunity.active, opportunity.pipelineId, opportunity.stageId, opportunity.budget, opportunity.assigneeId, opportunity.sourceId]);

  const stages = useMemo(
    () => meta.stages.filter((stage) => !form.pipelineId || String(stage.pipelineId || '') === form.pipelineId),
    [meta.stages, form.pipelineId],
  );

  const runUpdate = async (action: 'save' | 'won' | 'lost' | 'reopen') => {
    setError('');
    setSuccess('');

    if (!form.name.trim()) return setError('Opportunity name is required.');
    if (!form.pipelineId) return setError('Choose a pipeline.');
    if (!form.stageId) return setError('Choose a stage.');
    if (action === 'lost' && !lossReasonId) return setError('Choose a loss reason.');

    if (action === 'won' && !window.confirm(`Mark “${opportunity.name}” as Won in Flowlu?`)) return;
    if (action === 'lost' && !window.confirm(`Mark “${opportunity.name}” as Lost in Flowlu?`)) return;
    if (action === 'reopen' && !window.confirm(`Reopen “${opportunity.name}” in Flowlu?`)) return;

    setSaving(true);
    try {
      const result = await updateFlowluOpportunity({
        id: opportunity.id,
        name: form.name.trim(),
        pipelineId: Number(form.pipelineId),
        stageId: Number(form.stageId),
        sourceId: form.sourceId ? Number(form.sourceId) : null,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        budget: form.budget ? Number(form.budget) : 0,
        deadline: form.deadline,
        description: form.description,
        opportunityAction: action,
        lossReasonId: lossReasonId ? Number(lossReasonId) : undefined,
        closingComment,
      });
      onChanged(result.opportunity);
      setSuccess(
        action === 'won' ? 'Deal marked Won.' :
        action === 'lost' ? 'Deal marked Lost.' :
        action === 'reopen' ? 'Deal reopened.' :
        'Opportunity updated in Flowlu.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update Flowlu opportunity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="flowlu-deal-card">
      <div className="flowlu-deal-card-head">
        <div>
          <div className="flowlu-deal-id">Opportunity #{opportunity.id}</div>
          <h3>{opportunity.name}</h3>
        </div>
        <span className={`flowlu-deal-status ${statusClass(opportunity.active)}`}>{statusLabel(opportunity.active)}</span>
      </div>

      {opportunity.closingDate && opportunity.active !== 1 && (
        <div className="flowlu-deal-closed-note">
          Closed {opportunity.closingDate}{opportunity.closingComment ? ` · ${opportunity.closingComment}` : ''}
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}
      {success && <div className="flowlu-success">{success}</div>}

      <div className="flowlu-deal-grid">
        <label className="wide">
          <span>Opportunity Name</span>
          <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}/>
        </label>

        <label>
          <span>Pipeline</span>
          <select
            value={form.pipelineId}
            onChange={(event) => setForm((previous) => ({ ...previous, pipelineId: event.target.value, stageId: '' }))}
          >
            <option value="">Choose pipeline</option>
            {meta.pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <label>
          <span>Stage</span>
          <select value={form.stageId} onChange={(event) => setForm((previous) => ({ ...previous, stageId: event.target.value }))}>
            <option value="">Choose stage</option>
            {stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <label>
          <span>Budget</span>
          <input inputMode="decimal" placeholder="0" value={form.budget} onChange={(event) => setForm((previous) => ({ ...previous, budget: event.target.value }))}/>
        </label>

        <label>
          <span>Assignee</span>
          <select value={form.assigneeId} onChange={(event) => setForm((previous) => ({ ...previous, assigneeId: event.target.value }))}>
            <option value="">Unassigned</option>
            {meta.users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <label>
          <span>Source</span>
          <select value={form.sourceId} onChange={(event) => setForm((previous) => ({ ...previous, sourceId: event.target.value }))}>
            <option value="">No source</option>
            {meta.sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <label>
          <span>Expected Close Date</span>
          <input type="date" value={form.deadline} onChange={(event) => setForm((previous) => ({ ...previous, deadline: event.target.value }))}/>
        </label>

        <label className="wide">
          <span>Description</span>
          <textarea rows={3} value={form.description} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} placeholder="Opportunity notes…"/>
        </label>
      </div>

      <div className="flowlu-deal-save-row">
        <button className="btn flowlu-deal-save" type="button" disabled={saving} onClick={() => void runUpdate('save')}>
          <Save size={15}/>{saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {opportunity.active === 1 ? (
        <div className="flowlu-deal-close-box">
          <div className="flowlu-deal-close-fields">
            <label>
              <span>Loss Reason</span>
              <select value={lossReasonId} onChange={(event) => setLossReasonId(event.target.value)}>
                <option value="">Choose only when marking Lost</option>
                {lossReasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Closing Comment</span>
              <input value={closingComment} onChange={(event) => setClosingComment(event.target.value)} placeholder="Optional closing note"/>
            </label>
          </div>
          <div className="flowlu-deal-close-actions">
            <button type="button" className="flowlu-deal-won" disabled={saving} onClick={() => void runUpdate('won')}>
              <Trophy size={15}/> Mark Won
            </button>
            <button type="button" className="flowlu-deal-lost" disabled={saving} onClick={() => void runUpdate('lost')}>
              <XCircle size={15}/> Mark Lost
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="flowlu-deal-reopen" disabled={saving} onClick={() => void runUpdate('reopen')}>
          <RotateCcw size={15}/> Reopen Opportunity
        </button>
      )}
    </article>
  );
}

export function FlowluOpportunityCenter({ contact, onClose }: {
  contact: Contact | null;
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<FlowluSalesMeta | null>(null);
  const [opportunities, setOpportunities] = useState<FlowluOpportunity[]>([]);
  const [lossReasons, setLossReasons] = useState<FlowluLossReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!contact?.flowluId) return;
    setLoading(true);
    setError('');
    try {
      const [salesMeta, data] = await Promise.all([
        getFlowluSalesMeta(),
        getFlowluContactOpportunities(contact.flowluId),
      ]);
      setMeta(salesMeta);
      setOpportunities(data.opportunities || []);
      setLossReasons(data.lossReasons || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Flowlu opportunities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contact?.flowluId) void refresh();
    else {
      setMeta(null);
      setOpportunities([]);
      setLossReasons([]);
      setError('');
    }
  }, [contact?.flowluId]);

  if (!contact) return null;

  const replaceOpportunity = (next: FlowluOpportunity) => {
    setOpportunities((current) => current
      .map((item) => item.id === next.id ? next : item)
      .sort((a, b) => {
        if (a.active === 1 && b.active !== 1) return -1;
        if (b.active === 1 && a.active !== 1) return 1;
        return b.id - a.id;
      }));
  };

  return (
    <div className="flowlu-deal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flowlu-deal-center">
        <div className="flowlu-deal-center-head">
          <div>
            <span><BriefcaseBusiness size={16}/> Opportunity Control Center</span>
            <h2>{contact.name}</h2>
            <p>Manage Flowlu pipeline, stage, budget, owner and deal outcome without leaving Jai Dholera.</p>
          </div>
          <div className="flowlu-deal-head-actions">
            <button type="button" className="btn secondary" disabled={loading} onClick={() => void refresh()}>
              <RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh
            </button>
            <button type="button" className="flowlu-deal-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        {loading && !opportunities.length ? (
          <div className="flowlu-deal-empty">Loading Flowlu opportunities…</div>
        ) : !opportunities.length ? (
          <div className="flowlu-deal-empty">
            <BriefcaseBusiness size={30}/>
            <h3>No linked opportunities</h3>
            <p>Create the first opportunity from this contact’s Details drawer.</p>
          </div>
        ) : !meta ? (
          <div className="flowlu-deal-empty">Loading Flowlu sales setup…</div>
        ) : (
          <div className="flowlu-deal-list">
            <div className="flowlu-deal-summary">
              <span><CheckCircle2 size={15}/>{opportunities.filter((item) => item.active === 1).length} active</span>
              <span><Trophy size={15}/>{opportunities.filter((item) => item.active === 3).length} won</span>
              <span><XCircle size={15}/>{opportunities.filter((item) => item.active === 2).length} lost</span>
            </div>
            {opportunities.map((opportunity) => (
              <OpportunityEditor
                key={opportunity.id}
                opportunity={opportunity}
                meta={meta}
                lossReasons={lossReasons}
                onChanged={replaceOpportunity}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
