import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, ChevronDown, History, LogOut, Send } from 'lucide-react';
import { Sidebar, type AppPage } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { GoogleSheetCard } from './components/GoogleSheetCard';
import { ContactsTable } from './components/ContactsTable';
import { ContactsManager } from './components/ContactsManager';
import { TemplatePanel } from './components/TemplatePanel';
import { MessagePreview } from './components/MessagePreview';
import { CampaignSettings, type DeliveryMode } from './components/CampaignSettings';
import { CampaignStatus } from './components/CampaignStatus';
import { CampaignHistory } from './components/CampaignHistory';
import { Login } from './components/Login';
import { TemplateManager } from './components/TemplateManager';
import { TestMessageDialog } from './components/TestMessageDialog';
import { SeriesSelectionPanel } from './components/SeriesSelectionPanel';
import { UserManagement } from './components/UserManagement';
import { InvitePasswordSetup } from './components/InvitePasswordSetup';
import { cancelCampaign, getCampaigns, getCampaignStatus, getContacts, getCurrentStaffProfile, getDashboardStats, getMessageSeries, getMessageSeriesSchedules, getRecurringCampaigns, getStaffUsers, getTemplates, rescheduleCampaign, scheduleMessageSeries, sendCampaign, updateMessageSeriesSchedule, updateRecurringCampaign } from './lib/api';
import { supabase } from './lib/supabase';
import type { CampaignSummary, Contact, DashboardStats, MessageSeries, MessageSeriesScheduleSummary, RecipientStatus, RecurringCampaignSummary, StaffProfile, StaffUserProfile, WhatsAppTemplate } from './types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [profileReady, setProfileReady] = useState(!supabase);
  const [profile, setProfile] = useState<StaffProfile | null>(supabase ? null : {
    id: 'local-development',
    email: 'local@development.test',
    fullName: 'Local Development',
    role: 'admin',
    mustSetPassword: false,
  });
  const [profileError, setProfileError] = useState('');
  const [inviteMode, setInviteMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('invite') === '1'
      || window.location.hash.includes('type=invite');
  });
  const [page, setPage] = useState<AppPage>('dashboard');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [messageSeries, setMessageSeries] = useState<MessageSeries[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variables, setVariables] = useState<Record<string,string>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('now');
  const [recurrenceDays, setRecurrenceDays] = useState(30);
  const [syncedAt, setSyncedAt] = useState('');
  const [query, setQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [contactError, setContactError] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [statusRows, setStatusRows] = useState<RecipientStatus[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [recurringCampaigns, setRecurringCampaigns] = useState<RecurringCampaignSummary[]>([]);
  const [messageSeriesSchedules, setMessageSeriesSchedules] = useState<MessageSeriesScheduleSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [testMessageOpen, setTestMessageOpen] = useState(false);
  const [staffUsers, setStaffUsers] = useState<StaffUserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');

  const chosenContacts = useMemo(
    () => contacts.filter((contact) => selected.has(contact.id)),
    [contacts, selected],
  );
  const template = templates.find((item) => item.id === selectedTemplateId);
  const selectedSeries = messageSeries.find((item) => item.id === selectedSeriesId);
  const contentSelected = deliveryMode === 'series' ? Boolean(selectedSeries) : Boolean(template);
  const currentStep = campaignId ? 4 : contentSelected ? 3 : selected.size ? 2 : 1;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => setSession(nextSession),
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (!authReady) return;

    if (!session) {
      setProfile(null);
      setProfileError('');
      setProfileReady(true);
      return;
    }

    setProfileReady(false);
    setProfileError('');

    void getCurrentStaffProfile()
      .then((data) => {
        setProfile(data.profile);
        setProfileReady(true);
        if (data.profile.role !== 'admin' && page === 'users') {
          setPage('whatsapp');
        }
      })
      .catch((err) => {
        setProfile(null);
        setProfileError(err instanceof Error ? err.message : 'Unable to verify account access.');
        setProfileReady(true);
      });
  }, [authReady, session?.user.id]);

  const applyContacts = (nextContacts: Contact[], nextSyncedAt: string) => {
    setContacts(nextContacts);
    setSyncedAt(nextSyncedAt);
    const activeIds = new Set(
      nextContacts.filter((contact) => contact.status === 'Active').map((contact) => contact.id),
    );
    setSelected((previous) => new Set([...previous].filter((id) => activeIds.has(id))));
  };

  const refreshContacts = async () => {
    setLoadingContacts(true);
    setContactError('');
    try {
      const data = await getContacts();
      applyContacts(data.contacts, data.syncedAt);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Unable to load contacts.');
    } finally {
      setLoadingContacts(false);
    }
  };

  const refreshTemplates = async () => {
    setLoadingTemplates(true);
    setTemplateError('');
    try {
      const data = await getTemplates();
      setTemplates(data.templates);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Unable to load WhatsApp templates.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const refreshMessageSeries = async () => {
    try {
      const data = await getMessageSeries();
      setMessageSeries(data.series);
      setSelectedSeriesId((current) =>
        data.series.some((item) => item.id === current && item.status === 'READY') ? current : ''
      );
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Unable to load message series.');
    }
  };

  const refreshDashboard = async () => {
    setDashboardLoading(true);
    setDashboardError('');
    try {
      const data = await getDashboardStats();
      setDashboardStats(data.dashboard);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Unable to load dashboard analytics.');
    } finally {
      setDashboardLoading(false);
    }
  };

  const refreshStaffUsers = async () => {
    if (profile?.role !== 'admin') return;
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await getStaffUsers();
      setStaffUsers(data.users);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Unable to load user profiles.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady || !profileReady || (supabase && (!session || !profile))) return;
    void refreshContacts();
    void refreshTemplates();
    void refreshMessageSeries();
  }, [authReady, profileReady, session?.user.id, profile?.id]);

  useEffect(() => {
    if (page === 'dashboard') {
      void refreshDashboard();
    }
    if (page === 'users' && profile?.role === 'admin') {
      void refreshStaffUsers();
    }
  }, [page, profile?.role]);

  useEffect(() => {
    if (!campaignId || !statusRows.some((row) => ['Queued', 'Processing', 'Sent', 'Delivered'].includes(row.status))) return;
    const timer = window.setInterval(async () => {
      try {
        const data = await getCampaignStatus(campaignId);
        setStatusRows(data.recipients);
      } catch {
        // Keep the last status on transient polling failures.
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [campaignId, statusRows]);

  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = (ids: string[]) => setSelected((previous) => {
    const next = new Set(previous);
    const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
    ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
    return next;
  });

  const send = async () => {
    if (!campaignName.trim()) return setError('Enter a campaign name.');
    if (!chosenContacts.length) return setError('Select at least one active contact.');

    if (deliveryMode === 'series') {
      if (!selectedSeries) return setError('Choose a ready Message Series.');
      if (!scheduledAt) return setError('Choose the first send date and time for the series.');

      setSending(true);
      setError('');
      try {
        await scheduleMessageSeries({
          name: campaignName,
          seriesId: selectedSeries.id,
          contactIds: chosenContacts.map((contact) => contact.id),
          startAt: new Date(scheduledAt).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });

        const schedulesData = await getMessageSeriesSchedules();
        setMessageSeriesSchedules(schedulesData.schedules);
        setCampaignId('');
        setStatusRows([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to schedule message series.');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!template) return setError('Choose an approved WhatsApp template.');
    if (
      template.variables > 0 &&
      Array.from({ length: template.variables }, (_, i) => variables[String(i + 1)])
        .some((value) => !value?.trim())
    ) {
      return setError('Fill every required template variable. You can use {{name}}, {{phone}} or {{category}}.');
    }
    if (deliveryMode !== 'now' && !scheduledAt) {
      return setError('Choose the date and time for this scheduled campaign.');
    }
    if (deliveryMode === 'daily' && (recurrenceDays < 1 || recurrenceDays > 90)) {
      return setError('Daily recurrence must be between 1 and 90 days.');
    }
    if (
      template.headerType &&
      ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) &&
      !mediaUrl.trim()
    ) {
      return setError(`Add the public ${template.headerType.toLowerCase()} URL required by this template.`);
    }

    setSending(true);
    setError('');
    try {
      const data = await sendCampaign({
        name: campaignName,
        templateName: template.name,
        templateLanguage: template.language,
        contactIds: chosenContacts.map((contact) => contact.id),
        variableValues: variables,
        mediaUrl: mediaUrl.trim() || undefined,
        scheduledAt: deliveryMode !== 'now' && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        recurrenceDays: deliveryMode === 'daily' ? recurrenceDays : undefined,
      });
      setCampaignId(data.campaignId || '');
      setStatusRows(data.recurring ? [] : data.recipients);
      if (data.recurring) {
        const recurringData = await getRecurringCampaigns();
        setRecurringCampaigns(recurringData.recurringCampaigns);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign failed.');
    } finally {
      setSending(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const [campaignData, recurringData, seriesScheduleData] = await Promise.all([
        getCampaigns(),
        getRecurringCampaigns(),
        getMessageSeriesSchedules(),
      ]);
      setCampaigns(campaignData.campaigns);
      setRecurringCampaigns(recurringData.recurringCampaigns);
      setMessageSeriesSchedules(seriesScheduleData.schedules);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Unable to load campaign history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const cancelScheduledCampaign = async (campaign: CampaignSummary) => {
    await cancelCampaign(campaign.id);
    const data = await getCampaigns();
    setCampaigns(data.campaigns);
  };

  const rescheduleScheduledCampaign = async (
    campaign: CampaignSummary,
    nextScheduledAt: string,
    timezone: string,
  ) => {
    await rescheduleCampaign(campaign.id, nextScheduledAt, timezone);
    const data = await getCampaigns();
    setCampaigns(data.campaigns);
  };

  const updateRecurringSchedule = async (
    campaign: RecurringCampaignSummary,
    action: 'pause' | 'resume' | 'cancel',
  ) => {
    await updateRecurringCampaign(campaign.id, action);
    const data = await getRecurringCampaigns();
    setRecurringCampaigns(data.recurringCampaigns);
  };

  const updateSeriesSchedule = async (
    schedule: MessageSeriesScheduleSummary,
    action: 'pause' | 'resume' | 'cancel',
  ) => {
    await updateMessageSeriesSchedule(schedule.id, action);
    const data = await getMessageSeriesSchedules();
    setMessageSeriesSchedules(data.schedules);
  };

  if (!authReady || (session && !profileReady)) return <div className="app-loading">Loading…</div>;
  if (supabase && !session) return <Login />;

  if (session && (inviteMode || profile?.mustSetPassword)) {
    return <InvitePasswordSetup onComplete={() => setInviteMode(false)} />;
  }

  if (supabase && session && !profile) {
    return (
      <div className="login-page">
        <div className="login-card access-denied-card">
          <h1>Access Unavailable</h1>
          <p>{profileError || 'This account does not have active dashboard access.'}</p>
          <button className="send-btn" onClick={() => void supabase.auth.signOut()}>
            <LogOut size={17}/> Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        isAdmin={profile?.role === 'admin'}
        onNavigate={setPage}
        onHistory={openHistory}
        onTemplates={() => setTemplateManagerOpen(true)}
      />

      <main className="main">
        <header className="topbar">
          <div>
            <span>
              {page === 'dashboard' ? 'Overview' : page === 'contacts' ? 'Contacts' : page === 'users' ? 'Administration' : 'Campaigns'}
            </span>
            <b>›</b>
            <span>
              {page === 'dashboard' ? 'Dashboard' : page === 'contacts' ? 'Google Sheet' : page === 'users' ? 'Users & Access' : 'New Campaign'}
            </span>
          </div>
          <div className="user">
            <Bell size={18}/>
            <span className="avatar">
              {(profile?.fullName || profile?.email || 'Staff')
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('') || 'ST'}
            </span>
            <div className="topbar-profile">
              <b>{profile?.fullName || profile?.email || 'Local Staff'}</b>
              <span>{profile?.role === 'admin' ? 'Admin' : 'Staff'}</span>
            </div>
            <ChevronDown size={15}/>
            {supabase && (
              <button
                className="icon-btn"
                title="Sign out"
                onClick={() => void supabase?.auth.signOut()}
              >
                <LogOut size={17}/>
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {page === 'dashboard' ? (
            <Dashboard
              stats={dashboardStats}
              contacts={contacts}
              templates={templates}
              loading={dashboardLoading}
              error={dashboardError}
              onRefresh={refreshDashboard}
              onNewCampaign={() => setPage('whatsapp')}
              onHistory={openHistory}
            />
          ) : page === 'users' && profile?.role === 'admin' ? (
            <UserManagement
              currentProfile={profile}
              users={staffUsers}
              loading={usersLoading}
              error={usersError}
              onRefresh={refreshStaffUsers}
            />
          ) : page === 'contacts' ? (
            <ContactsManager
              contacts={contacts}
              syncedAt={syncedAt}
              loading={loadingContacts}
              error={contactError}
              onRefresh={refreshContacts}
              onChanged={applyContacts}
            />
          ) : (
            <>
              <div className="page-head">
                <div>
                  <h1>WhatsApp Campaign</h1>
                  <p>Live Google Sheets contacts → WhatsApp Official templates → delivery tracking</p>
                </div>
                <button className="btn secondary" onClick={openHistory}>
                  <History size={16}/> Campaign History
                </button>
              </div>

              {error && <div className="alert">{error}</div>}

              <div className="progress">
                {[['1','Select Contacts'],['2','Choose Content'],['3','Compose & Preview'],['4','Send & Track']]
                  .map(([step,label], index) => (
                    <div key={step} style={{display:'contents'}}>
                      <div className={`progress-item ${currentStep === Number(step) ? 'active' : currentStep > Number(step) ? 'complete' : ''}`}>
                        <b>{step}</b><span>{label}</span>
                      </div>
                      {index < 3 && <div className="line"/>}
                    </div>
                  ))}
              </div>

              <div className="dashboard-grid">
                <div className="left-col">
                  <GoogleSheetCard
                    syncedAt={syncedAt}
                    loading={loadingContacts}
                    onRefresh={refreshContacts}
                    error={contactError}
                  />
                  <ContactsTable
                    contacts={contacts}
                    selected={selected}
                    onToggle={toggle}
                    onToggleAll={toggleAll}
                    query={query}
                    setQuery={setQuery}
                  />
                  <CampaignSettings
                    name={campaignName}
                    setName={setCampaignName}
                    scheduledAt={scheduledAt}
                    setScheduledAt={setScheduledAt}
                    deliveryMode={deliveryMode}
                    setDeliveryMode={setDeliveryMode}
                    recurrenceDays={recurrenceDays}
                    setRecurrenceDays={setRecurrenceDays}
                  />
                </div>

                <div className="right-col">
                  {deliveryMode === 'series' ? (
                    <SeriesSelectionPanel
                      series={messageSeries}
                      selectedId={selectedSeriesId}
                      onSelect={(id) => {
                        setSelectedSeriesId(id);
                        setCampaignId('');
                        setStatusRows([]);
                      }}
                      templates={templates}
                      contact={chosenContacts[0]}
                    />
                  ) : (
                    <>
                  <TemplatePanel
                    templates={templates}
                    selectedId={selectedTemplateId}
                    onSelect={(id) => {
                      setSelectedTemplateId(id);
                      setVariables({});
                      setMediaUrl('');
                      setCampaignId('');
                      setStatusRows([]);
                    }}
                    variableValues={variables}
                    onVariableChange={(index,value) =>
                      setVariables((previous) => ({ ...previous, [String(index)]: value }))
                    }
                    mediaUrl={mediaUrl}
                    onMediaUrlChange={setMediaUrl}
                    loading={loadingTemplates}
                    error={templateError}
                  />
                  <MessagePreview
                    template={template}
                    values={variables}
                    contact={chosenContacts[0]}
                    mediaUrl={mediaUrl}
                  />
                    </>
                  )}
                  <div className="campaign-action-row">
                    {deliveryMode !== 'series' ? (
                      <button
                        className="btn test-send-btn"
                        onClick={() => setTestMessageOpen(true)}
                        disabled={!template}
                      >
                        <Send size={17}/> Send Test Message
                      </button>
                    ) : (
                      <div className="series-send-info">
                        {selectedSeries ? selectedSeries.steps.length + ' different daily messages' : 'Choose a message series'}
                      </div>
                    )}
                    <button className="send-btn campaign-send-btn" onClick={send} disabled={sending}>
                      <Send size={19}/>
                      {sending
                        ? 'Processing…'
                        : deliveryMode === 'series'
                          ? 'Schedule Message Series'
                          : deliveryMode === 'daily'
                            ? 'Schedule Daily Campaign'
                            : deliveryMode === 'once'
                              ? 'Schedule WhatsApp Campaign'
                              : 'Send WhatsApp Message'}
                    </button>
                  </div>
                  <div className="send-meta">
                    Selected contacts: <b>{selected.size}</b> &nbsp;|&nbsp; {deliveryMode === 'series' ? 'Series' : 'Template'}:{' '}
                    <b>
                      {deliveryMode === 'series'
                        ? selectedSeries?.name || '—'
                        : template ? `${template.name} · ${template.language}` : '—'}
                    </b>
                  </div>
                </div>
              </div>

              <CampaignStatus rows={statusRows}/>
            </>
          )}
        </div>
      </main>

      <CampaignHistory
        open={historyOpen}
        campaigns={campaigns}
        recurringCampaigns={recurringCampaigns}
        messageSeriesSchedules={messageSeriesSchedules}
        loading={historyLoading}
        error={historyError}
        onClose={() => setHistoryOpen(false)}
        onCancel={cancelScheduledCampaign}
        onReschedule={rescheduleScheduledCampaign}
        onRecurringAction={updateRecurringSchedule}
        onMessageSeriesAction={updateSeriesSchedule}
      />
      <TemplateManager
        open={templateManagerOpen}
        onClose={() => setTemplateManagerOpen(false)}
        isAdmin={profile?.role === 'admin'}
        onChanged={async () => {
          await refreshTemplates();
          await refreshMessageSeries();
        }}
      />
      <TestMessageDialog
        open={testMessageOpen}
        template={template}
        variableValues={variables}
        mediaUrl={mediaUrl}
        onClose={() => setTestMessageOpen(false)}
      />
    </div>
  );
}
