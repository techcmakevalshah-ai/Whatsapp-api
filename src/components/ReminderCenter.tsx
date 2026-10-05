import { BellRing, Check, Clock3, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getReminders, updateReminder, type AppReminder } from '../lib/reminders';
import './ReminderCenter.css';

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

function ReminderCard({ reminder, onChanged }: {
  reminder: AppReminder;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const due = new Date(reminder.remindAt);
  const overdue = due.getTime() < Date.now();

  const act = async (
    reminderAction: 'complete' | 'cancel' | 'snooze',
    extra?: { minutes?: number; remindAt?: string },
  ) => {
    setSaving(true);
    try {
      await updateReminder({
        id: reminder.id,
        reminderAction,
        snoozeCount: reminder.snoozeCount,
        ...extra,
      });
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={'reminder-card' + (overdue ? ' overdue' : '')}>
      <div className="reminder-card-top">
        <h3>{reminder.title}</h3>
        <time>{due.toLocaleString()}</time>
      </div>
      {reminder.contactName && (
        <div className="reminder-contact">
          {reminder.contactName}{reminder.contactPhone ? ` · +${reminder.contactPhone}` : ''}
        </div>
      )}
      {reminder.note && <p className="reminder-note">{reminder.note}</p>}
      <div className="reminder-actions">
        <button type="button" disabled={saving} onClick={() => void act('snooze', { minutes: 60 })}>
          <RotateCcw size={13}/> 1 hour
        </button>
        <button type="button" disabled={saving} onClick={() => void act('snooze', { remindAt: tomorrowMorningIso() })}>
          <Clock3 size={13}/> Tomorrow 10 AM
        </button>
        <button type="button" className="done" disabled={saving} onClick={() => void act('complete')}>
          <Check size={13}/> Done
        </button>
        <button type="button" className="cancel" disabled={saving} onClick={() => void act('cancel')}>
          <X size={13}/> Cancel
        </button>
      </div>
    </article>
  );
}

export function ReminderCenter() {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState<AppReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getReminders('pending');
      setReminders(data.reminders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reminders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const changed = () => void refresh();
    window.addEventListener('reminders:changed', changed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('reminders:changed', changed);
    };
  }, []);

  const now = new Date();
  const groups = useMemo(() => {
    const overdue: AppReminder[] = [];
    const today: AppReminder[] = [];
    const upcoming: AppReminder[] = [];
    reminders.forEach((reminder) => {
      const due = new Date(reminder.remindAt);
      if (due.getTime() < now.getTime()) overdue.push(reminder);
      else if (sameLocalDay(due, now)) today.push(reminder);
      else upcoming.push(reminder);
    });
    return { overdue, today, upcoming };
  }, [reminders, now.getMinutes()]);

  const dueCount = groups.overdue.length;

  return (
    <div className="reminder-center-wrap">
      <button type="button" className="btn secondary reminder-trigger" onClick={() => setOpen(true)}>
        <BellRing size={16}/><span className="reminder-trigger-label">Reminders</span>
        {dueCount > 0 && <span className="reminder-badge">{dueCount > 99 ? '99+' : dueCount}</span>}
      </button>

      {open && (
        <div className="reminder-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <aside className="reminder-panel">
            <div className="reminder-head">
              <div>
                <BellRing size={20}/>
                <span><h2>My Reminders</h2><small>{reminders.length} pending</small></span>
              </div>
              <button type="button" className="reminder-close" onClick={() => setOpen(false)} aria-label="Close reminders"><X size={17}/></button>
            </div>

            {error && <div className="reminder-error">{error}</div>}
            {loading && !reminders.length ? (
              <div className="reminder-loading">Loading reminders…</div>
            ) : reminders.length ? (
              <div className="reminder-list">
                {groups.overdue.length > 0 && (
                  <section className="reminder-group">
                    <div className="reminder-group-title overdue">Overdue</div>
                    {groups.overdue.map((item) => <ReminderCard key={item.id} reminder={item} onChanged={refresh}/>) }
                  </section>
                )}
                {groups.today.length > 0 && (
                  <section className="reminder-group">
                    <div className="reminder-group-title">Today</div>
                    {groups.today.map((item) => <ReminderCard key={item.id} reminder={item} onChanged={refresh}/>) }
                  </section>
                )}
                {groups.upcoming.length > 0 && (
                  <section className="reminder-group">
                    <div className="reminder-group-title">Upcoming</div>
                    {groups.upcoming.map((item) => <ReminderCard key={item.id} reminder={item} onChanged={refresh}/>) }
                  </section>
                )}
              </div>
            ) : (
              <div className="reminder-empty"><BellRing size={28}/><div>No pending reminders.</div></div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
