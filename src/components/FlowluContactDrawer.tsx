import { BriefcaseBusiness, Mail, MapPin, Phone, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createFlowluOpportunity, getFlowluSalesMeta } from '../lib/api';
import type { Contact, FlowluSalesMeta } from '../types';

export function FlowluContactDrawer({ contact, onClose }: {
  contact: Contact | null;
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<FlowluSalesMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    name: '',
    budget: '',
    pipelineId: '',
    stageId: '',
    sourceId: '',
    assigneeId: '',
  });

  useEffect(() => {
    if (!contact) return;
    setForm({
      name: contact.name + ' - Opportunity',
      budget: '',
      pipelineId: '',
      stageId: '',
      sourceId: '',
      assigneeId: contact.ownerId ? String(contact.ownerId) : '',
    });
    setError('');
    setSuccess('');
    setLoadingMeta(true);
    void getFlowluSalesMeta()
      .then((data) => setMeta(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load Flowlu sales setup.'))
      .finally(() => setLoadingMeta(false));
  }, [contact?.id]);

  const stages = useMemo(
    () => (meta?.stages || []).filter((stage) => !form.pipelineId || String(stage.pipelineId || '') === form.pipelineId),
    [meta, form.pipelineId],
  );

  if (!contact) return null;

  const owner = meta?.users.find((user) => user.id === contact.ownerId);

  const submit = async () => {
    if (!contact.flowluId) return setError('Flowlu contact id is missing.');
    if (!form.pipelineId) return setError('Choose a pipeline.');
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await createFlowluOpportunity({
        accountId: contact.flowluId,
        name: form.name.trim(),
        budget: form.budget ? Number(form.budget) : undefined,
        pipelineId: Number(form.pipelineId),
        stageId: form.stageId ? Number(form.stageId) : undefined,
        sourceId: form.sourceId ? Number(form.sourceId) : undefined,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
      });
      setSuccess('Opportunity #' + result.opportunityId + ' created and linked to ' + contact.name + '.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create Flowlu opportunity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flowlu-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="flowlu-contact-drawer">
        <div className="flowlu-drawer-head">
          <div>
            <span>Flowlu Contact</span>
            <h2>{contact.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18}/></button>
        </div>

        <div className="flowlu-contact-facts">
          <div><Phone size={15}/><span><small>Mobile</small><b>+{contact.phone}</b></span></div>
          {contact.email && <div><Mail size={15}/><span><small>Email</small><b>{contact.email}</b></span></div>}
          <div><UserRound size={15}/><span><small>Segment</small><b>{contact.category}</b></span></div>
          <div><UserRound size={15}/><span><small>Owner</small><b>{owner?.name || (contact.ownerId ? 'User #' + contact.ownerId : 'Unassigned')}</b></span></div>
          {contact.address && <div><MapPin size={15}/><span><small>Address</small><b>{contact.address}</b></span></div>}
        </div>

        {contact.description && (
          <div className="flowlu-contact-description">
            <small>Notes</small>
            <p>{contact.description}</p>
          </div>
        )}

        <div className="flowlu-opportunity-box">
          <div className="flowlu-opportunity-title"><BriefcaseBusiness size={16}/><b>Create Opportunity</b></div>
          {error && <div className="inline-error">{error}</div>}
          {success && <div className="flowlu-success">{success}</div>}

          <label><span>Opportunity Name</span><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}/></label>
          <div className="flowlu-opportunity-grid">
            <label>
              <span>Pipeline *</span>
              <select value={form.pipelineId} disabled={loadingMeta} onChange={(e) => setForm((p) => ({ ...p, pipelineId: e.target.value, stageId: '' }))}>
                <option value="">{loadingMeta ? 'Loading…' : 'Choose pipeline'}</option>
                {(meta?.pipelines || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Stage</span>
              <select value={form.stageId} disabled={!form.pipelineId} onChange={(e) => setForm((p) => ({ ...p, stageId: e.target.value }))}>
                <option value="">Default / first stage</option>
                {stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Source</span>
              <select value={form.sourceId} onChange={(e) => setForm((p) => ({ ...p, sourceId: e.target.value }))}>
                <option value="">No source</option>
                {(meta?.sources || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Assignee</span>
              <select value={form.assigneeId} onChange={(e) => setForm((p) => ({ ...p, assigneeId: e.target.value }))}>
                <option value="">Unassigned</option>
                {(meta?.users || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Budget</span>
              <input inputMode="decimal" placeholder="e.g. 2500000" value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}/>
            </label>
          </div>

          <button type="button" className="btn flowlu-create-opportunity" disabled={saving || loadingMeta} onClick={() => void submit()}>
            <BriefcaseBusiness size={16}/>{saving ? 'Creating…' : 'Create in Flowlu'}
          </button>
        </div>
      </aside>
    </div>
  );
}
