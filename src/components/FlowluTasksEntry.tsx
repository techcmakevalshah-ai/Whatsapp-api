import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ContactRound,
  FolderOpen,
  Home,
  ListTodo,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { FlowluTasksBoard } from './FlowluTasksBoard';
import { Login } from './Login';
import { getCurrentStaffProfile } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { StaffProfile } from '../types';
import './FlowluTasksShell.css';

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

  const goHome = () => window.location.assign('/');
  const today = new Date();
  const weekday = today.toLocaleDateString([], { weekday: 'short' });
  const dayNumber = today.getDate();
  const initials = (profile?.fullName || profile?.email || 'Team')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'ST';

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
    <div className="flowlu-shell">
      <aside className="flowlu-shell-sidebar">
        <div className="flowlu-shell-brand">
          <div className="flowlu-shell-brand-box">
            <b>CMA Keval Shah</b>
            <small>WE ARE A GLOBAL GROWTH TEAM</small>
          </div>
        </div>

        <nav className="flowlu-shell-nav">
          <button onClick={goHome}><Home size={20}/><span>Home</span></button>
          <button className="active"><ListTodo size={20}/><span>Tasks</span></button>

          <div className="flowlu-nav-section">
            <div className="flowlu-nav-group-label"><ContactRound size={20}/><span>CRM</span></div>
            <div className="flowlu-nav-sub">
              <button onClick={goHome}><span>Contacts & Opportunities</span></button>
              <button onClick={goHome}><span>Activities</span></button>
              <button onClick={goHome}><span>Accounts</span></button>
            </div>
          </div>

          <div className="flowlu-nav-static"><MessageCircle size={20}/><span>WhatsApp</span></div>
          <div className="flowlu-nav-static"><FolderOpen size={20}/><span>Projects</span></div>
          <div className="flowlu-nav-static"><UsersRound size={20}/><span>My Team</span></div>
          <div className="flowlu-nav-static"><CalendarDays size={20}/><span>Calendar</span></div>
          <div className="flowlu-nav-static"><BarChart3 size={20}/><span>Reports</span></div>
          {profile?.role === 'admin' && <div className="flowlu-nav-static"><ShieldCheck size={20}/><span>Administration</span></div>}
          <div className="flowlu-nav-static"><Settings size={20}/><span>Settings</span></div>
        </nav>
      </aside>

      <main className="flowlu-shell-main">
        <header className="flowlu-shell-topbar">
          <div className="flowlu-top-left">
            <button className="flowlu-top-menu" title="Menu"><Menu size={21}/></button>
            <button className="flowlu-top-action" title="Create task" onClick={() => document.querySelector<HTMLButtonElement>('.flowlu-create-btn')?.click()}><Plus size={25}/></button>
            <button className="flowlu-top-action" title="Search tasks" onClick={() => document.querySelector<HTMLInputElement>('.flowlu-task-search input')?.focus()}><Search size={23}/></button>
          </div>

          <div className="flowlu-top-right">
            <div className="flowlu-top-date">
              <span><small>{weekday}</small><b>{dayNumber}</b></span>
            </div>
            <div className="flowlu-top-time">
              <small>Task workspace</small>
              <b>Flowlu</b>
            </div>
            <button className="flowlu-top-action" title="Notifications"><Bell size={21}/></button>
            <div className="flowlu-top-profile">
              <span className="flowlu-top-avatar">{initials}</span>
              <div className="flowlu-top-profile-text">
                <b>{profile?.fullName || profile?.email || 'Team'}</b>
                <small>{profile?.role === 'admin' ? 'Admin' : 'Team member'}</small>
              </div>
              {supabase && (
                <button className="flowlu-top-signout" title="Sign out" onClick={() => void supabase.auth.signOut()}>
                  <LogOut size={17}/>
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="flowlu-shell-content">
          <FlowluTasksBoard />
        </div>
      </main>
    </div>
  );
}
