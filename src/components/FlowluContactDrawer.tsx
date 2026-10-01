import { BriefcaseBusiness, CalendarPlus, Mail, MapPin, MessageSquareText, Phone, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  createFlowluContactNote,
  createFlowluFollowupTask,
  createFlowluOpportunity,
  getFlowluSalesMeta,
} from '../lib/api';
import type { Contact, FlowluSalesMeta } from '../types';

export function FlowluContactDrawer({ contact, onClose }: {
  contact: Contact | null;
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<FlowluSalesMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [opportunitySaving, setOpportunitySaving] = useState(false);
  const [opportunityError, setOpportunityError] = useState('');
  const [opportunitySuccess, setOpportunitySuccess] = useState('');
  const [opportunityForm, setOpportunityForm] = useState({
    name: '',
    budget: '',
    pipelineId: '',
    stageId: '',
    sourceId: '',
    assigneeId: '',
  });

  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [taskSuccess, setTaskSuccess] = useState('');
  const [taskForm, setTaskForm] = useState({
    name: '',
    deadline: '',
    responsibleId: '',
    description: '',
  });

  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!contact) return;

    const ownerId = contact.ownerId ? String(contact.ownerId) : '';

    setOpportunityForm({
      name: contact.name + ' - Opportunity',
      budget: '',
      pipelineId: '',
      stageId: '',
      sourceId: '',
      assigneeId: ownerId,
    });
    setTaskForm({
      name: 'Follow up with ' + contact.name,
      deadline: '',
      responsibleId: ownerId,
      description: '',
    });
    setNoteText('');

    setOpportunityError('');
    setOpportunitySuccess('');
    setTaskError('');
    setTaskSuccess('');
    setNoteError('');
    setNoteSuccess('');

    setLoadingMeta(true);
    void getFlowluSalesMeta()
      .then((data) => setMeta(data))
      .catch((err) => setOpportunityError(err instanceof Error ? err.message : 'Unable to load Flowlu sales setup.'))
      .finally(() => setLoadingMeta(false));
  }, [contact?.id]);

  const stages = useMemo(
    () => (meta?.stages || []).filter(
      (stage) => !opportunityForm.pipelineId || String(stage.pipelineId || '') === opportunityForm.pipelineId,
    ),
    [meta, opportunityForm.pipelineId],
  );

  if (!contact) return null;

  const owner = meta?.users.find((user) => user.id === contact.ownerId);

  const submitOpportunity = async () => {
    if (!contact.flowluId) return setOpportunityError('Flowlu contact id is missing.');
    if (!opportunityForm.pipelineId) return setOpportunityError('Choose a pipeline.');

    setOpportunitySaving(true);
    setOpportunityError('');
    setOpportunitySuccess('');

    try {
      const result = await createFlowluOpportunity({
        accountId: contact.flowluId,
        name: opportunityForm.name.trim(),
        budget: opportunityForm.budget ? Number(opportunityForm.budget) : undefined,
        pipelineId: Number(opportunityForm.pipelineId),
        stageId: opportunityForm.stageId ? Number(opportunityForm.stageId) : undefined,
        sourceId: opportunityForm.sourceId ? Number(opportunityForm.sourceId) : undefined,
        assigneeId: opportunityForm.assigneeId ? Number(opportunityForm.assigneeId) : undefined,
      });
      setOpportunitySuccess('Opportunity #' + result.opportunityId + ' created and linked to ' + contact.name + '.');
    } catch (err) {
      setOpportunityError(err instanceof Error ? err.message : 'Unable to create Flowlu opportunity.');
    } finally {
      setOpportunitySaving(false);
    }
  };

  const submitTask = async () => {
    if (!contact.flowluId) return setTaskError('Flowlu contact id is missing.');
    if (!taskForm.responsibleId) return setTaskError('Choose a responsible team member.');

    setTaskSaving(true);
    setTaskError('');
    setTaskSuccess('');

    try {
      const result = await createFlowluFollowupTask({
        accountId: contact.flowluId,
        name: taskForm.name.trim(),
        responsibleId: Number(taskForm.responsibleId),
        deadline: taskForm.deadline || undefined,
        description: taskForm.description.trim() || undefined,
      });
      setTaskSuccess('Follow-up task #' + result.taskId + ' created in Flowlu.');
      setTaskForm((previous) => ({ ...previous, deadline: '', description: '' }));
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Unable to create follow-up task.');
    } finally {
      setTaskSaving(false);
    }
  };

  const submitNote = async () => {
    if (!contact.flowluId) return setNoteError('Flowlu contact id is missing.');
    if (!noteText.trim()) return setNoteError('Enter a note.');

    setNoteSaving(true);
    setNoteError('');
    setNoteSuccess('');

    try {
      await createFlowluContactNote({
        accountId: contact.flowluId,
        text: noteText.trim(),
      });
      setNoteSuccess('Note added to the Flowlu contact.');
      setNoteText('');
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Unable to add CRM note.');
    } finally {
      setNoteSaving(false);
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

        <div className="flowlu-crm-action-box">
          <div className="flowlu-opportunity-title"><BriefcaseBusiness size={16}/><b>Create Opportunity</b></div>
          {opportunityError && <div className="inline-error">{opportunityError}</div>}
          {opportunitySuccess && <div className="flowlu-success">{opportunitySuccess}</div>}

          <label>
            <span>Opportunity Name</span>
            <input value={opportunityForm.name} onChange={(e) => setOpportunityForm((p) => ({ ...p, name: e.target.value }))}/>
          </label>

          <div className="flowlu-opportunity-grid">
            <label>
              <span>Pipeline *</span>
              <select value={opportunityForm.pipelineId} disabled={loadingMeta} onChange={(e) => setOpportunityForm((p) => ({ ...p, pipelineId: e.target.value, stageId: '' }))}>
                <option value="">{loadingMeta ? 'Loading…' : 'Choose pipeline'}</option>
                {(meta?.pipelines || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <label>
              <span>Stage</span>
              <select value={opportunityForm.stageId} disabled={!opportunityForm.pipelineId} onChange={(e) => setOpportunityForm((p) => ({ ...p, stageId: e.target.value }))}>
                <option value="">Default / first stage</option>
                {stages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <label>
              <span>Source</span>
              <select value={opportunityForm.sourceId} onChange={(e) => setOpportunityForm((p) => ({ ...p, sourceId: e.target.value }))}>
                <option value="">No source</option>
                {(meta?.sources || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <label>
              <span>Assignee</span>
              <select value={opportunityForm.assigneeId} onChange={(e) => setOpportunityForm((p) => ({ ...p, assigneeId: e.target.value }))}>
                <option value="">Unassigned</option>
                {(meta?.users || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <label>
              <span>Budget</span>
              <input inputMode="decimal" placeholder="e.g. 2500000" value={opportunityForm.budget} onChange={(e) => setOpportunityForm((p) => ({ ...p, budget: e.target.value }))}/>
            </label>
          </div>

          <button type="button" className="btn flowlu-create-opportunity" disabled={opportunitySaving || loadingMeta} onClick={() => void submitOpportunity()}>
            <BriefcaseBusiness size={16}/>{opportunitySaving ? 'Creating…' : 'Create Opportunity'}
          </button>
        </div>

        <div className="flowlu-crm-action-box">
          <div className="flowlu-opportunity-title"><CalendarPlus size={16}/><b>Create Follow-up Task</b></div>
          {taskError && <div className="inline-error">{taskError}</div>}
          {taskSuccess && <div className="flowlu-success">{taskSuccess}</div>}

          <label>
            <span>Task Name</span>
            <input value={taskForm.name} onChange={(e) => setTaskForm((p) => ({ ...p, name: e.target.value }))}/>
          </label>

          <div className="flowlu-opportunity-grid">
            <label>
              <span>Responsible *</span>
              <select value={taskForm.responsibleId} disabled={loadingMeta} onChange={(e) => setTaskForm((p) => ({ ...p, responsibleId: e.target.value }))}>
                <option value="">{loadingMeta ? 'Loading…' : 'Choose team member'}</option>
                {(meta?.users || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <label>
              <span>Due Date & Time</span>
              <input type="datetime-local" value={taskForm.deadline} onChange={(e) => setTaskForm((p) => ({ ...p, deadline: e.target.value }))}/>
            </label>
          </div>

          <label>
            <span>Description</span>
            <textarea rows={3} placeholder="Follow-up instructions…" value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))}/>
          </label>

          <button type="button" className="btn flowlu-secondary-action" disabled={taskSaving || loadingMeta} onClick={() => void submitTask()}>
            <CalendarPlus size={16}/>{taskSaving ? 'Creating…' : 'Create Follow-up'}
          </button>
        </div>

        <div className="flowlu-crm-action-box">
          <div className="flowlu-opportunity-title"><MessageSquareText size={16}/><b>Add CRM Note</b></div>
          {noteError && <div className="inline-error">{noteError}</div>}
          {noteSuccess && <div className="flowlu-success">{noteSuccess}</div>}

          <label>
            <span>Note</span>
            <textarea rows={4} placeholder="Add an internal note to this Flowlu contact…" value={noteText} onChange={(e) => setNoteText(e.target.value)}/>
          </label>

          <button type="button" className="btn flowlu-secondary-action" disabled={noteSaving} onClick={() => void submitNote()}>
            <MessageSquareText size={16}/>{noteSaving ? 'Adding…' : 'Add Note'}
          </button>
        </div>
      </aside>
    </div>
  );
}
