import { AlarmClock, BellRing, Check, Clock3, RefreshCw, RotateCcw, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getReminders, updateReminder, type AppReminder } from '../lib/reminders';
import './DashboardReminders.css';

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function tomorrowMorningIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function dueLabel(reminder: AppReminder, now: Date) {
  const due = new Date(reminder.remindAt);
  if (due.getTime() < now.getTime()) {
    const minutes = Math.max(1, Math.floor((now.getTime() - due.getTime()) / 60_000));
    if (minutes < 60) return `${minutes}m overdue`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h overdue`;
    const days = Math.floor(hours / 24);
    return `${days}d overdue`;
  }
  if (sameLocalDay(due, now)) {
    return due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    + ' · '
    + due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function DashboardReminders() {
  const [reminders, setReminders] = useState<AppReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [tick, setTick] = useState(0);

  const refresh = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const data = await getReminders('pending');
      setReminders((data.reminders || []).slice().sort(
        (a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime(),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reminders.');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
      void refresh(true);
    }, 60_000);
    const changed = () => void refresh(true);
    window.addEventListener('reminders:changed', changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('reminders:changed', changed);
    };
  }, []);

  const now = useMemo(() => new Date(), [tick, reminders.length]);
  const groups = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let upcoming = 0;
    reminders.forEach((reminder) => {
      const due = new Date(reminder.remindAt);
      if (due.getTime() < now.getTime()) overdue += 1;
      else if (sameLocalDay(due, now)) today += 1;
      else upcoming += 1;
    });
    return { overdue, today, upcoming };
  }, [reminders, now]);

  const visible = reminders.slice(0, 6);

  const act = async (
    reminder: AppReminder,
    reminderAction: 'complete' | 'snooze',
    extra?: { minutes?: number; remindAt?: string },
  ) => {
    setSavingId(reminder.id);
    try {
      await updateReminder({
        id: reminder.id,
        reminderAction,
        snoozeCount: reminder.snoozeCount,
        ...extra,
      });
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update reminder.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <article className="dashboard-panel dashboard-reminders-panel">
      <div className="dashboard-panel-head dashboard-reminders-head">
        <div>
          <h2><BellRing size={18}/> Follow-up Reminders</h2>
          <p>Your most urgent client follow-ups and tasks.</p>
        </div>
        <button className="btn secondary dashboard-reminders-refresh" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''}/> Refresh
        </button>
      </div>

      <div className="dashboard-reminder-summary">
        <div className={groups.overdue ? 'danger' : ''}>
          <span>Overdue</span>
          <strong>{groups.overdue}</strong>
        </div>
        <div>
          <span>Due Today</span>
          <strong>{groups.today}</strong>
        </div>
        <div>
          <span>Upcoming</span>
          <strong>{groups.upcoming}</strong>
        </div>
      </div>

      {error && <div className="dashboard-reminder-error">{error}</div>}

      {loading && !reminders.length ? (
        <div className="dashboard-reminder-empty">Loading reminders…</div>
      ) : visible.length ? (
        <div className="dashboard-reminder-list">
          {visible.map((reminder) => {
            const due = new Date(reminder.remindAt);
            const overdue = due.getTime() < now.getTime();
            const saving = savingId === reminder.id;
            return (
              <div className={'dashboard-reminder-row' + (overdue ? ' overdue' : '')} key={reminder.id}>
                <div className="dashboard-reminder-icon"><AlarmClock size={17}/></div>
                <div className="dashboard-reminder-copy">
                  <div className="dashboard-reminder-title-line">
                    <b>{reminder.title}</b>
                    <span className={overdue ? 'overdue-label' : ''}>{dueLabel(reminder, now)}</span>
                  </div>
                  {(reminder.contactName || reminder.note) && (
                    <div className="dashboard-reminder-meta">
                      {reminder.contactName && <span><UserRound size={13}/>{reminder.contactName}</span>}
                      {reminder.note && <span className="dashboard-reminder-note">{reminder.note}</span>}
                    </div>
                  )}
                </div>
                <div className="dashboard-reminder-actions">
                  <button type="button" disabled={saving} title="Snooze 1 hour" onClick={() => void act(reminder, 'snooze', { minutes: 60 })}>
                    <RotateCcw size={14}/><span>1h</span>
                  </button>
                  <button type="button" disabled={saving} title="Tomorrow 10 AM" onClick={() => void act(reminder, 'snooze', { remindAt: tomorrowMorningIso() })}>
                    <Clock3 size={14}/><span>Tomorrow</span>
                  </button>
                  <button type="button" className="done" disabled={saving} onClick={() => void act(reminder, 'complete')}>
                    <Check size={14}/><span>Done</span>
                  </button>
                </div>
              </div>
            );
          })}
          {reminders.length > visible.length && (
            <div className="dashboard-reminder-more">+{reminders.length - visible.length} more pending reminder{reminders.length - visible.length === 1 ? '' : 's'}</div>
          )}
        </div>
      ) : (
        <div className="dashboard-reminder-empty">
          <BellRing size={25}/>
          <div><b>No pending reminders</b><span>Your follow-ups will appear here automatically.</span></div>
        </div>
      )}
    </article>
  );
}
