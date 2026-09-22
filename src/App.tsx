import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, ChevronDown, History, LogOut, Send } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { GoogleSheetCard } from './components/GoogleSheetCard';
import { ContactsTable } from './components/ContactsTable';
import { TemplatePanel } from './components/TemplatePanel';
import { MessagePreview } from './components/MessagePreview';
import { CampaignSettings } from './components/CampaignSettings';
import { CampaignStatus } from './components/CampaignStatus';
import { CampaignHistory } from './components/CampaignHistory';
import { Login } from './components/Login';
import { getCampaigns, getCampaignStatus, getContacts, getTemplates, sendCampaign } from './lib/api';
import { supabase } from './lib/supabase';
import type { CampaignSummary, Contact, RecipientStatus, WhatsAppTemplate } from './types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [variables, setVariables] = useState<Record<string,string>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [syncedAt, setSyncedAt] = useState('');
  const [query, setQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [statusRows, setStatusRows] = useState<RecipientStatus[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const chosenContacts = useMemo(() => contacts.filter((contact) => selected.has(contact.id)), [contacts, selected]);
  const template = templates.find((item) => item.id === selectedTemplateId);
  const currentStep = campaignId ? 4 : template ? 3 : selected.size ? 2 : 1;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.subscription.unsubscribe();
  }, []);

  const refreshContacts = async () => {
    setLoadingContacts(true);
    setError('');
    try {
      const data = await getContacts();
      setContacts(data.contacts);
      setSyncedAt(data.syncedAt);
      const eligibleIds = new Set(data.contacts.filter((contact) => contact.optIn && contact.status === 'Active').map((contact) => contact.id));
      setSelected((previous) => new Set([...previous].filter((id) => eligibleIds.has(id))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load contacts.');
    } finally {
      setLoadingContacts(false);
    }
  };

  const refreshTemplates = async () => {
    setLoadingTemplates(true);
    setError('');
    try {
      const data = await getTemplates();
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load WhatsApp templates.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!authReady || (supabase && !session)) return;
    void refreshContacts();
    void refreshTemplates();
  }, [authReady, session?.user.id]);

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
    if (!template) return setError('Choose an approved WhatsApp template.');
    if (!chosenContacts.length) return setError('Select at least one active, opted-in contact.');
    if (template.variables > 0 && Array.from({ length: template.variables }, (_, i) => variables[String(i + 1)]).some((value) => !value?.trim())) {
      return setError('Fill every required template variable. You can use {{name}}, {{phone}} or {{category}}.');
    }
    if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) && !mediaUrl.trim()) {
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
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      setCampaignId(data.campaignId);
      setStatusRows(data.recipients);
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
      const data = await getCampaigns();
      setCampaigns(data.campaigns);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Unable to load campaign history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!authReady) return <div className="app-loading">Loading…</div>;
  if (supabase && !session) return <Login />;

  return <div className="app-shell">
    <Sidebar onHistory={openHistory} />
    <main className="main">
      <header className="topbar">
        <div><span>Campaigns</span><b>›</b><span>New Campaign</span></div>
        <div className="user"><Bell size={18}/><span className="avatar">KS</span><b>{session?.user.email || 'Local Staff'}</b><ChevronDown size={15}/>{supabase && <button className="icon-btn" title="Sign out" onClick={() => void supabase?.auth.signOut()}><LogOut size={17}/></button>}</div>
      </header>
      <div className="content">
        <div className="page-head"><div><h1>WhatsApp Campaign</h1><p>Live Google Sheets contacts → WhatsApp Official templates → delivery tracking</p></div><button className="btn secondary" onClick={openHistory}><History size={16}/> Campaign History</button></div>
        {error && <div className="alert">{error}</div>}
        {!supabase && <div className="dev-banner">Supabase client is not configured. This mode is intended only for local development with server auth disabled.</div>}
        <div className="progress">
          {[['1','Select Contacts'],['2','Choose Template'],['3','Compose & Preview'],['4','Send & Track']].map(([step,label], index) => <div key={step} style={{display:'contents'}}><div className={`progress-item ${currentStep === Number(step) ? 'active' : currentStep > Number(step) ? 'complete' : ''}`}><b>{step}</b><span>{label}</span></div>{index < 3 && <div className="line"/>}</div>)}
        </div>
        <div className="dashboard-grid">
          <div className="left-col">
            <GoogleSheetCard syncedAt={syncedAt} loading={loadingContacts} onRefresh={refreshContacts}/>
            <ContactsTable contacts={contacts} selected={selected} onToggle={toggle} onToggleAll={toggleAll} query={query} setQuery={setQuery}/>
            <CampaignSettings name={campaignName} setName={setCampaignName} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}/>
          </div>
          <div className="right-col">
            <TemplatePanel templates={templates} selectedId={selectedTemplateId} onSelect={(id) => { setSelectedTemplateId(id); setVariables({}); setMediaUrl(''); setCampaignId(''); setStatusRows([]); }} variableValues={variables} onVariableChange={(index,value) => setVariables((previous) => ({ ...previous, [String(index)]: value }))} mediaUrl={mediaUrl} onMediaUrlChange={setMediaUrl} loading={loadingTemplates}/>
            <MessagePreview template={template} values={variables} contact={chosenContacts[0]}/>
            <button className="send-btn" onClick={send} disabled={sending}><Send size={19}/>{sending ? 'Processing…' : scheduledAt ? 'Schedule WhatsApp Campaign' : 'Send WhatsApp Message'}</button>
            <div className="send-meta">Selected contacts: <b>{selected.size}</b> &nbsp;|&nbsp; Template: <b>{template ? `${template.name} · ${template.language}` : '—'}</b></div>
          </div>
        </div>
        <CampaignStatus rows={statusRows}/>
      </div>
    </main>
    <CampaignHistory open={historyOpen} campaigns={campaigns} loading={historyLoading} error={historyError} onClose={() => setHistoryOpen(false)} />
  </div>;
}
