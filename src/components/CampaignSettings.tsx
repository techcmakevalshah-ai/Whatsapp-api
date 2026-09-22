import { CalendarClock, Clock3, Send } from 'lucide-react';

function toLocalInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function CampaignSettings({
  name,
  setName,
  scheduledAt,
  setScheduledAt,
}: {
  name: string;
  setName: (v: string) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const scheduleMode = Boolean(scheduledAt);
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
            placeholder="e.g. Dholera Weekly Update"
          />
        </label>

        <div className="schedule-mode-field">
          <span className="schedule-field-label">Delivery</span>
          <div className="schedule-mode-toggle">
            <button
              type="button"
              className={!scheduleMode ? 'active' : ''}
              onClick={() => setScheduledAt('')}
            >
              <Send size={14}/> Send Now
            </button>
            <button
              type="button"
              className={scheduleMode ? 'active' : ''}
              onClick={() => {
                if (!scheduledAt) setQuick(15);
              }}
            >
              <CalendarClock size={14}/> Schedule Later
            </button>
          </div>
        </div>
      </div>

      {scheduleMode && (
        <div className="schedule-panel">
          <div className="schedule-input-row">
            <label>
              <span>Send Date & Time</span>
              <input
                type="datetime-local"
                min={minSchedule}
                max={maxSchedule}
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>

            <div className="schedule-timezone">
              <Clock3 size={16}/>
              <div>
                <b>{timezone}</b>
                <small>Scheduling uses your browser timezone.</small>
              </div>
            </div>
          </div>

          <div className="schedule-quick-actions">
            <span>Quick schedule:</span>
            <button type="button" onClick={() => setQuick(15)}>+15 min</button>
            <button type="button" onClick={() => setQuick(60)}>+1 hour</button>
            <button type="button" onClick={setTomorrowMorning}>Tomorrow 9:00 AM</button>
          </div>

          <div className="schedule-note">
            Scheduled campaigns are checked every minute. You can cancel or reschedule them from Campaign History until sending starts.
          </div>
        </div>
      )}
    </section>
  );
}
