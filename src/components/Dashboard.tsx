import {
  Activity,
  CalendarClock,
  CheckCheck,
  ContactRound,
  Eye,
  FileCheck2,
  History,
  MessageCircleMore,
  RefreshCw,
  Repeat2,
  Send,
  Sparkles,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import type { Contact, DashboardStats, WhatsAppTemplate } from '../types';

function pct(part: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function shortDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (['sent', 'completed'].includes(normalized)) return 'ok';
  if (['scheduled', 'sending'].includes(normalized)) return 'pending-pill';
  if (normalized.includes('error') || normalized === 'failed') return 'bad';
  return 'muted';
}

export function Dashboard({
  stats,
  contacts,
  templates,
  loading,
  error,
  onRefresh,
  onNewCampaign,
  onHistory,
}: {
  stats: DashboardStats | null;
  contacts: Contact[];
  templates: WhatsAppTemplate[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onNewCampaign: () => void;
  onHistory: () => void;
}) {
  const activeContacts = contacts.filter((contact) => contact.status === 'Active').length;
  const approvedTemplates = templates.filter((template) => template.status === 'APPROVED').length;
  const sent = stats?.sent || 0;
  const delivered = stats?.delivered || 0;
  const read = stats?.read || 0;
  const failed = stats?.failed || 0;
  const maxDaily = Math.max(
    1,
    ...(stats?.daily || []).flatMap((point) => [point.sent, point.delivered, point.read]),
  );

  return (
    <section className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-kicker"><Sparkles size={14}/> Live WhatsApp Overview</div>
          <h1>Dashboard</h1>
          <p>Campaign activity, delivery performance and automation health in one place.</p>
        </div>
        <div className="dashboard-hero-actions">
          <button className="btn secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh
          </button>
          <button className="send-btn dashboard-primary-action" onClick={onNewCampaign}>
            <Send size={16}/> New Campaign
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="dashboard-stat-grid">
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon green-bg"><ContactRound size={18}/></span>
          <div>
            <small>Active Contacts</small>
            <strong>{activeContacts.toLocaleString()}</strong>
            <span>{contacts.length.toLocaleString()} total contacts</span>
          </div>
        </article>
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon blue-bg"><MessageCircleMore size={18}/></span>
          <div>
            <small>Total Messages</small>
            <strong>{(stats?.messagesTotal || 0).toLocaleString()}</strong>
            <span>{(stats?.campaignsTotal || 0).toLocaleString()} campaigns</span>
          </div>
        </article>
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon teal-bg"><CheckCheck size={18}/></span>
          <div>
            <small>Delivered</small>
            <strong>{delivered.toLocaleString()}</strong>
            <span>{pct(delivered, sent)} of sent</span>
          </div>
        </article>
        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon purple-bg"><Eye size={18}/></span>
          <div>
            <small>Read</small>
            <strong>{read.toLocaleString()}</strong>
            <span>{pct(read, delivered)} of delivered</span>
          </div>
        </article>
      </div>

      <div className="dashboard-main-grid">
        <article className="dashboard-panel dashboard-activity-panel">
          <div className="dashboard-panel-head">
            <div>
              <h2>7-Day Delivery Activity</h2>
              <p>Live status events received from OfficialWA.</p>
            </div>
            <div className="dashboard-legend">
              <span><i className="legend-sent"/>Sent</span>
              <span><i className="legend-delivered"/>Delivered</span>
              <span><i className="legend-read"/>Read</span>
            </div>
          </div>

          <div className="dashboard-chart">
            {(stats?.daily || []).map((point) => (
              <div className="dashboard-chart-day" key={point.day}>
                <div className="dashboard-bar-cluster">
                  <span
                    className="dashboard-bar sent-bar"
                    title={`Sent: ${point.sent}`}
                    style={{ height: `${Math.max(4, (point.sent / maxDaily) * 100)}%` }}
                  />
                  <span
                    className="dashboard-bar delivered-bar"
                    title={`Delivered: ${point.delivered}`}
                    style={{ height: `${Math.max(4, (point.delivered / maxDaily) * 100)}%` }}
                  />
                  <span
                    className="dashboard-bar read-bar"
                    title={`Read: ${point.read}`}
                    style={{ height: `${Math.max(4, (point.read / maxDaily) * 100)}%` }}
                  />
                </div>
                <small>{shortDay(point.day)}</small>
              </div>
            ))}
            {!stats?.daily?.length && <div className="dashboard-chart-empty">No activity yet.</div>}
          </div>

          <div className="dashboard-delivery-strip">
            <div><Send size={15}/><span>Sent</span><b>{sent.toLocaleString()}</b></div>
            <div><CheckCheck size={15}/><span>Delivered</span><b>{delivered.toLocaleString()}</b></div>
            <div><Eye size={15}/><span>Read</span><b>{read.toLocaleString()}</b></div>
            <div><TriangleAlert size={15}/><span>Failed</span><b>{failed.toLocaleString()}</b></div>
          </div>
        </article>

        <aside className="dashboard-side-stack">
          <article className="dashboard-panel">
            <div className="dashboard-panel-head compact">
              <div>
                <h2>Automation</h2>
                <p>Current scheduled activity.</p>
              </div>
              <Activity size={18}/>
            </div>
            <div className="dashboard-automation-list">
              <div>
                <span className="automation-icon"><CalendarClock size={16}/></span>
                <span>Scheduled Campaigns</span>
                <b>{stats?.scheduled || 0}</b>
              </div>
              <div>
                <span className="automation-icon"><Repeat2 size={16}/></span>
                <span>Daily Campaigns</span>
                <b>{stats?.activeRecurring || 0}</b>
              </div>
              <div>
                <span className="automation-icon"><Workflow size={16}/></span>
                <span>Message Series</span>
                <b>{stats?.activeSeries || 0}</b>
              </div>
            </div>
          </article>

          <article className="dashboard-panel">
            <div className="dashboard-panel-head compact">
              <div>
                <h2>Content Ready</h2>
                <p>Available for campaign use.</p>
              </div>
              <FileCheck2 size={18}/>
            </div>
            <div className="dashboard-content-ready">
              <strong>{approvedTemplates}</strong>
              <span>approved templates</span>
              <small>{templates.length} templates in your library</small>
            </div>
          </article>
        </aside>
      </div>

      <article className="dashboard-panel dashboard-recent-panel">
        <div className="dashboard-panel-head">
          <div>
            <h2>Recent Campaigns</h2>
            <p>Latest campaign performance from Supabase.</p>
          </div>
          <button className="btn secondary" onClick={onHistory}><History size={14}/> View History</button>
        </div>

        {loading && !stats ? (
          <div className="empty-state compact-empty">Loading dashboard…</div>
        ) : stats?.recentCampaigns?.length ? (
          <div className="table-wrap dashboard-recent-table">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Template</th>
                  <th>Recipients</th>
                  <th>Delivered</th>
                  <th>Read</th>
                  <th>Failed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCampaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <b>{campaign.name}</b>
                      <small className="dashboard-date">
                        {new Date(campaign.createdAt).toLocaleString()}
                      </small>
                    </td>
                    <td>{campaign.templateName}</td>
                    <td>{campaign.totalRecipients}</td>
                    <td>{campaign.delivered}</td>
                    <td>{campaign.read}</td>
                    <td>{campaign.failed}</td>
                    <td><span className={`pill ${statusClass(campaign.status)}`}>{campaign.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact-empty">No campaigns yet. Create your first campaign to populate the dashboard.</div>
        )}
      </article>
    </section>
  );
}
