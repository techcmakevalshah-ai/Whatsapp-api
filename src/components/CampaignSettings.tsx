import { CalendarClock, Clock3, ListTree, Repeat2, Send } from 'lucide-react';

export type DeliveryMode = 'now' | 'once' | 'daily' | 'series';

function toLocalInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function CampaignSettings({
  name,
  setName,
  scheduledAt,
  setScheduledAt,
  deliveryMode,
  setDeliveryMode,
  recurrenceDays,
  setRecurrenceDays,
}: {
  name: string;
  setName: (v: string) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  deliveryMode: DeliveryMode;
  setDeliveryMode: (v: DeliveryMode) => void;
  recurrenceDays: number;
  setRecurrenceDays: (v: number) => void;
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const minSchedule = toLocalInput(new Date(Date.now() + 60_000));
  const maxSchedule = toLocalInput(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));

  const setQuick = (minutes: number) => {
    setScheduledAt(toLocalInput(new Date(Date.now() + minutes * 60_000)));
  };

  const setTomorrowMorning = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    setScheduledAt(toLocalInput(date));
  };

  const selectMode = (mode: DeliveryMode) => {
    setDeliveryMode(mode);
    if (mode === 'now') {
      setScheduledAt('');
      return;
    }
    if (!scheduledAt) setQuick(15);
  };

  const lastRun = (() => {
    if (deliveryMode !== 'daily' || !scheduledAt || !recurrenceDays) return null;
    const start = new Date(scheduledAt);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + recurrenceDays - 1);
    return end;
  })();

  return (
    <section className="card soft-purple campaign-settings-card">
      <div className="section-title purple-text">
        <span className="step purple">5</span>
        Campaign Settings
      </div>

      <div className="settings-grid campaign-settings-grid">
        <label>
          <span>Campaign Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Dholera Daily Update"
          />
        </label>

        <div className="schedule-mode-field">
          <span className="schedule-field-label">Delivery</span>
          <div className="schedule-mode-toggle schedule-mode-four">
            <button
              type="button"
              className={deliveryMode === 'now' ? 'active' : ''}
              onClick={() => selectMode('now')}
            >
              <Send size={14}/> Send Now
            </button>
            <button
              type="button"
              className={deliveryMode === 'once' ? 'active' : ''}
              onClick={() => selectMode('once')}
            >
              <CalendarClock size={14}/> Schedule Once
            </button>
            <button
              type="button"
              className={deliveryMode === 'daily' ? 'active' : ''}
              onClick={() => selectMode('daily')}
            >
              <Repeat2 size={14}/> Repeat Daily
            </button>
            <button
              type="button"
              className={deliveryMode === 'series' ? 'active' : ''}
              onClick={() => selectMode('series')}
            >
              <ListTree size={14}/> Message Series
            </button>
          </div>
        </div>
      </div>

      {deliveryMode !== 'now' && (
        <div className="schedule-panel">
          <div className="schedule-input-row">
            <label>
              <span>
                {deliveryMode === 'daily'
                  ? 'First Send Date & Time'
                  : deliveryMode === 'series'
                    ? 'First Series Send Date & Time'
                    : 'Send Date & Time'}
              </span>
              <input
                type="datetime-local"
                min={minSchedule}
                max={maxSchedule}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>

            {deliveryMode === 'daily' && (
              <label className="recurrence-days-field">
                <span>Number of Days</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={recurrenceDays}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setRecurrenceDays(Number.isFinite(value) ? Math.max(1, Math.min(90, value)) : 1);
                  }}
                />
              </label>
            )}

            <div className="schedule-timezone">
              <Clock3 size={16}/>
              <div>
                <b>{timezone}</b>
                <small>Uses your browser timezone.</small>
              </div>
            </div>
          </div>

          <div className="schedule-quick-actions">
            <span>Quick schedule:</span>
            <button type="button" onClick={() => setQuick(15)}>+15 min</button>
            <button type="button" onClick={() => setQuick(60)}>+1 hour</button>
            <button type="button" onClick={setTomorrowMorning}>Tomorrow 9:00 AM</button>
          </div>

          {deliveryMode === 'daily' && (
            <div className="recurrence-summary">
              <Repeat2 size={16}/>
              <div>
                <b>{'Daily for ' + recurrenceDays + ' day' + (recurrenceDays === 1 ? '' : 's')}</b>
                <span>
                  {scheduledAt
                    ? <>{'First: ' + new Date(scheduledAt).toLocaleString()}{lastRun ? ' · Last: ' + lastRun.toLocaleString() : ''}</>
                    : 'Choose the first send date and time.'}
                </span>
              </div>
            </div>
          )}

          <div className="schedule-note">
            {deliveryMode === 'daily'
              ? 'The same approved template, variables and media will be used each day. Only contacts that are still Active in Google Sheets at send time will receive that day’s message.'
              : deliveryMode === 'series'
                ? 'Each day uses the separate template, variables and media configured in Manage Templates → Series Messages. Only contacts still Active in Google Sheets receive that day’s message.'
                : 'Scheduled campaigns are checked every minute. You can cancel or reschedule them from Campaign History until sending starts.'}
          </div>
        </div>
      )}
    </section>
  );
}
