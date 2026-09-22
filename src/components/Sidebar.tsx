import { BarChart3, ContactRound, FolderOpen, LayoutDashboard, MessageCircle, Settings } from 'lucide-react';

const items = [
  [LayoutDashboard, 'Dashboard'],
  [ContactRound, 'Contacts'],
  [MessageCircle, 'WhatsApp'],
  [FolderOpen, 'Google Drive'],
  [BarChart3, 'Analytics'],
  [Settings, 'Settings'],
] as const;

export function Sidebar({ onHistory }: { onHistory: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◎</span><span>CMA Keval Shah</span></div>
      <nav>
        {items.map(([Icon, label]) => (
          <div key={label} className={`nav-item ${label === 'WhatsApp' ? 'active' : ''}`}>
            <Icon size={18} /><span>{label}</span>
          </div>
        ))}
        <div className="subnav active-sub">New Campaign</div>
        <button className="subnav subnav-button" onClick={onHistory}>Campaign History</button>
        <div className="subnav">Message Templates</div>
      </nav>
      <div className="sidebar-help"><b>WhatsApp Official</b><span>Google Sheets → approved template → delivery tracking</span></div>
    </aside>
  );
}
