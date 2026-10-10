import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Bell, ChevronDown, LogOut } from 'lucide-react';
import { Sidebar, type AppPage } from './Sidebar';
import { FlowluTasksBoard } from './FlowluTasksBoard';
import { Login } from './Login';
import { getCurrentStaffProfile } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { StaffProfile } from '../types';

export function FlowluTasksEntry() {
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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !authReady) return;
    if (!session) {
      setProfile(null);
      setProfileReady(true);
      return;
    }

    setProfileReady(false);
    setProfileError('');
    void getCurrentStaffProfile()
      .then((data) => setProfile(data.profile))
      .catch((error) => {
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : 'Unable to verify account access.');
      })
      .finally(() => setProfileReady(true));
  }, [authReady, session?.user.id]);

  const navigate = (page: AppPage) => {
    if (page === 'tasks') return;
    window.location.assign('/');
  };

  if (!authReady || (session && !profileReady)) return <div className="app-loading">Loading…</div>;
  if (supabase && !session) return <Login />;

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
        page="tasks"
        isAdmin={profile?.role === 'admin'}
        onNavigate={navigate}
        onHistory={() => window.location.assign('/')}
        onTemplates={() => window.location.assign('/')}
      />
      <main className="main">
        <header className="topbar">
          <div><span>Work</span><b>›</b><span>Flowlu Tasks</span></div>
          <div className="user">
            <Bell size={18}/>
            <span className="avatar">
              {(profile?.fullName || profile?.email || 'Team')
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('') || 'ST'}
            </span>
            <div className="topbar-profile">
              <b>{profile?.fullName || profile?.email || 'Local Team'}</b>
              <span>{profile?.role === 'admin' ? 'Admin' : 'Team'}</span>
            </div>
            <ChevronDown size={15}/>
            {supabase && (
              <button className="icon-btn" title="Sign out" onClick={() => void supabase.auth.signOut()}>
                <LogOut size={17}/>
              </button>
            )}
          </div>
        </header>
        <div className="content flowlu-task-content">
          <FlowluTasksBoard />
        </div>
      </main>
    </div>
  );
}
