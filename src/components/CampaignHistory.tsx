import { CalendarClock, Pause, Play, Save, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { CampaignSummary, MessageSeriesScheduleSummary, RecurringCampaignSummary } from '../types';

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function statusClass(status: string) {
  if (status === 'sent' || status === 'active' || status === 'completed') return 'ok';
  if (status === 'scheduled' || status === 'sending' || status === 'paused') return 'pending-pill';
  if (status === 'sent_with_errors') return 'bad';
  return 'muted';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CampaignHistory({
  open,
  campaigns,
  recurringCampaigns,
  messageSeriesSchedules,
  loading,
  error,
  onClose,
  onCancel,
  onReschedule,
  onRecurringAction,
  onMessageSeriesAction,
}: {
  open: boolean;
  campaigns: CampaignSummary[];
  recurringCampaigns: RecurringCampaignSummary[];
  messageSeriesSchedules: MessageSeriesScheduleSummary[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onCancel: (campaign: CampaignSummary) => Promise<void>;
  onReschedule: (campaign: CampaignSummary, scheduledAt: string, timezone: string) => Promise<void>;
  onRecurringAction: (campaign: RecurringCampaignSummary, action: 'pause' | 'resume' | 'cancel') => Promise<void>;
  onMessageSeriesAction: (schedule: MessageSeriesScheduleSummary, action: 'pause' | 'resume' | 'cancel') => Promise<void>;
}) {
  const [editingId, setEditingId] = useState('');
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');

  if (!open) return null;

  const beginReschedule = (campaign: CampaignSummary) => {
    setEditingId(campaign.id);
    setRescheduleValue(toLocalInput(campaign.scheduledAt));
    setActionError('');
  };

  const saveReschedule = async (campaign: CampaignSummary) => {
    if (!rescheduleValue) {
      setActionError('Choose a new date and time.');
      return;
    }

    const date = new Date(rescheduleValue);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 60_000) {
      setActionError('Choose a time at least 1 minute in the future.');
      return;
    }

    setBusyId(campaign.id);
    setActionError('');
    try {
      await onReschedule(
        campaign,
        date.toISOString(),
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      );
      setEditingId('');
      setRescheduleValue('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to reschedule campaign.');
    } finally {
      setBusyId('');
    }
  };

  const cancel = async (campaign: CampaignSummary) => {
    const confirmed = window.confirm(
      'Cancel "' + campaign.name + '"? No queued messages from this scheduled campaign will be sent.',
    );
    if (!confirmed) return;

    setBusyId(campaign.id);
    setActionError('');
    try {
      await onCancel(campaign);
      if (editingId === campaign.id) {
        setEditingId('');
        setRescheduleValue('');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel campaign.');
    } finally {
      setBusyId('');
    }
  };

  const recurringAction = async (
    campaign: RecurringCampaignSummary,
    action: 'pause' | 'resume' | 'cancel',
  ) => {
    if (action === 'cancel') {
      const confirmed = window.confirm(
        'Cancel recurring series "' + campaign.name + '"? Future daily sends will stop.',
      );
      if (!confirmed) return;
    }

    setBusyId(campaign.id);
    setActionError('');
    try {
      await onRecurringAction(campaign, action);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update recurring campaign.');
    } finally {
      setBusyId('');
    }
  };

  const messageSeriesAction = async (
    schedule: MessageSeriesScheduleSummary,
    action: 'pause' | 'resume' | 'cancel',
  ) => {
    if (action === 'cancel') {
      const confirmed = window.confirm(
        'Cancel message series "' + schedule.name + '"? All future series days will stop.',
      );
      if (!confirmed) return;
    }

    setBusyId(schedule.id);
    setActionError('');
    try {
      await onMessageSeriesAction(schedule, action);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update message series.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="history-modal history-modal-wide" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Campaign History & Schedules</h2>
            <p>Manage one-time campaigns and recurring daily schedules.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        {(error || actionError) && <div className="alert">{actionError || error}</div>}

        <div className="history-section-title">Recurring Daily Schedules</div>
        {loading ? (
          <div className="empty-state">Loading schedules…</div>
        ) : recurringCampaigns.length ? (
          <div className="table-wrap recurring-history-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Template</th>
                  <th>Recipients</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Next Send</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recurringCampaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <b>{campaign.name}</b>
                      {campaign.schedulerError && (
                        <small className="campaign-scheduler-error">{campaign.schedulerError}</small>
                      )}
                    </td>
                    <td>{campaign.templateName}</td>
                    <td>{campaign.totalRecipients}</td>
                    <td>
                      <b>{campaign.runsCreated}/{campaign.totalDays}</b>
                      <small className="campaign-timezone">
                        {campaign.totalDays - campaign.runsCreated} remaining
                      </small>
                    </td>
                    <td>
                      <span className={'pill ' + statusClass(campaign.status)}>
                        {statusLabel(campaign.status)}
                      </span>
                    </td>
                    <td>
                      {campaign.nextRunAt ? new Date(campaign.nextRunAt).toLocaleString() : '—'}
                      <small className="campaign-timezone">{campaign.timezone}</small>
                    </td>
                    <td>
                      <div className="campaign-history-actions">
                        {campaign.status === 'active' && (
                          <button
                            className="btn schedule-history-button"
                            disabled={busyId === campaign.id}
                            onClick={() => void recurringAction(campaign, 'pause')}
                          >
                            <Pause size={14}/> Pause
                          </button>
                        )}
                        {campaign.status === 'paused' && (
                          <button
                            className="btn schedule-history-button"
                            disabled={busyId === campaign.id}
                            onClick={() => void recurringAction(campaign, 'resume')}
                          >
                            <Play size={14}/> Resume
                          </button>
                        )}
                        {['active', 'paused'].includes(campaign.status) && (
                          <button
                            className="btn cancel-history-button"
                            disabled={busyId === campaign.id}
                            onClick={() => void recurringAction(campaign, 'cancel')}
                          >
                            <XCircle size={14}/> Cancel
                          </button>
                        )}
                        {!['active', 'paused'].includes(campaign.status) && '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty">No recurring schedules yet.</div>
        )}

        <div className="history-section-title one-time-title">Message Series Schedules</div>
        {loading ? (
          <div className="empty-state">Loading message series…</div>
        ) : messageSeriesSchedules.length ? (
          <div className="table-wrap recurring-history-table">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Series</th>
                  <th>Recipients</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Next Send</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {messageSeriesSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>
                      <b>{schedule.name}</b>
                      {schedule.schedulerError && (
                        <small className="campaign-scheduler-error">{schedule.schedulerError}</small>
                      )}
                    </td>
                    <td>{schedule.seriesName}</td>
                    <td>{schedule.totalRecipients}</td>
                    <td>
                      <b>{schedule.runsCreated}/{schedule.totalDays}</b>
                      <small className="campaign-timezone">
                        {Math.max(0, schedule.totalDays - schedule.runsCreated)} remaining
                      </small>
                    </td>
                    <td>
                      <span className={'pill ' + statusClass(schedule.status)}>
                        {statusLabel(schedule.status)}
                      </span>
                    </td>
                    <td>
                      {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : '—'}
                      <small className="campaign-timezone">{schedule.timezone}</small>
                    </td>
                    <td>
                      <div className="campaign-history-actions">
                        {schedule.status === 'active' && (
                          <button
                            className="btn schedule-history-button"
                            disabled={busyId === schedule.id}
                            onClick={() => void messageSeriesAction(schedule, 'pause')}
                          >
                            <Pause size={14}/> Pause
                          </button>
                        )}
                        {schedule.status === 'paused' && (
                          <button
                            className="btn schedule-history-button"
                            disabled={busyId === schedule.id}
                            onClick={() => void messageSeriesAction(schedule, 'resume')}
                          >
                            <Play size={14}/> Resume
                          </button>
                        )}
                        {['active', 'paused'].includes(schedule.status) && (
                          <button
                            className="btn cancel-history-button"
                            disabled={busyId === schedule.id}
                            onClick={() => void messageSeriesAction(schedule, 'cancel')}
                          >
                            <XCircle size={14}/> Cancel
                          </button>
                        )}
                        {!['active', 'paused'].includes(schedule.status) && '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty">No message series schedules yet.</div>
        )}

        <div className="history-section-title one-time-title">One-time Campaigns & Daily Send Records</div>
        {loading ? (
          <div className="empty-state">Loading campaigns…</div>
        ) : campaigns.length ? (
          <div className="table-wrap campaign-history-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Template</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <b>{campaign.name}</b>
                      {campaign.schedulerError && (
                        <small className="campaign-scheduler-error">{campaign.schedulerError}</small>
                      )}
                    </td>
                    <td>{campaign.templateName}</td>
                    <td>{campaign.totalRecipients}</td>
                    <td>
                      <span className={'pill ' + statusClass(campaign.status)}>
                        {statusLabel(campaign.status)}
                      </span>
                    </td>
                    <td>
                      {campaign.scheduledAt
                        ? new Date(campaign.scheduledAt).toLocaleString()
                        : '—'}
                      {campaign.status === 'scheduled' && campaign.timezone && (
                        <small className="campaign-timezone">{campaign.timezone}</small>
                      )}
                    </td>
                    <td>{new Date(campaign.createdAt).toLocaleString()}</td>
                    <td>
                      {campaign.status === 'scheduled' ? (
                        editingId === campaign.id ? (
                          <div className="reschedule-inline">
                            <input
                              type="datetime-local"
                              value={rescheduleValue}
                              onChange={(event) => setRescheduleValue(event.target.value)}
                            />
                            <button
                              className="icon-btn schedule-save-button"
                              title="Save new schedule"
                              disabled={busyId === campaign.id}
                              onClick={() => void saveReschedule(campaign)}
                            >
                              <Save size={15}/>
                            </button>
                            <button
                              className="icon-btn"
                              title="Close reschedule"
                              onClick={() => setEditingId('')}
                            >
                              <X size={15}/>
                            </button>
                          </div>
                        ) : (
                          <div className="campaign-history-actions">
                            <button
                              className="btn schedule-history-button"
                              disabled={busyId === campaign.id}
                              onClick={() => beginReschedule(campaign)}
                            >
                              <CalendarClock size={14}/> Reschedule
                            </button>
                            <button
                              className="btn cancel-history-button"
                              disabled={busyId === campaign.id}
                              onClick={() => void cancel(campaign)}
                            >
                              <XCircle size={14}/> Cancel
                            </button>
                          </div>
                        )
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty">No campaigns yet.</div>
        )}
      </section>
    </div>
  );
}
