import { BarChart3, ContactRound, FolderOpen, LayoutDashboard, MessageCircle, Settings, ShieldCheck } from 'lucide-react';

export type AppPage = 'whatsapp' | 'contacts' | 'users';

export function Sidebar({
  page,
  isAdmin,
  onNavigate,
  onHistory,
  onTemplates,
}: {
  page: AppPage;
  isAdmin: boolean;
  onNavigate: (page: AppPage) => void;
  onHistory: () => void;
  onTemplates: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◎</span><span>CMA Keval Shah</span></div>

      <nav>
        <div className="nav-item nav-disabled" title="Coming later">
          <LayoutDashboard size={18}/><span>Dashboard</span>
        </div>

        <button
          className={`nav-item nav-button ${page === 'contacts' ? 'active' : ''}`}
          onClick={() => onNavigate('contacts')}
        >
          <ContactRound size={18}/><span>Contacts</span>
        </button>

        <button
          className={`nav-item nav-button ${page === 'whatsapp' ? 'active' : ''}`}
          onClick={() => onNavigate('whatsapp')}
        >
          <MessageCircle size={18}/><span>WhatsApp</span>
        </button>

        {isAdmin && (
          <button
            className={`nav-item nav-button ${page === 'users' ? 'active' : ''}`}
            onClick={() => onNavigate('users')}
          >
            <ShieldCheck size={18}/><span>Users & Access</span>
          </button>
        )}

        <div className="nav-item nav-disabled" title="Coming later">
          <FolderOpen size={18}/><span>Google Drive</span>
        </div>
        <div className="nav-item nav-disabled" title="Coming later">
          <BarChart3 size={18}/><span>Analytics</span>
        </div>
        <div className="nav-item nav-disabled" title="Coming later">
          <Settings size={18}/><span>Settings</span>
        </div>

        {page === 'whatsapp' && (
          <>
            <div className="subnav active-sub">New Campaign</div>
            <button className="subnav subnav-button" onClick={onHistory}>Campaign History</button>
            <button className="subnav subnav-button" onClick={onTemplates}>Message Templates</button>
          </>
        )}
      </nav>

      <div className="sidebar-help">
        <b>WhatsApp Official</b>
        <span>Google Sheets → approved template → delivery tracking</span>
      </div>
    </aside>
  );
}
