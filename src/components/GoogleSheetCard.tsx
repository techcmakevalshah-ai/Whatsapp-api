import { RefreshCw, Sheet } from 'lucide-react';

export function GoogleSheetCard({ syncedAt, loading, onRefresh }: { syncedAt?: string; loading: boolean; onRefresh: () => void }) {
  return (
    <section className="card soft-green">
      <div className="section-title"><span className="step green">1</span> Connect Google Sheet</div>
      <div className="sheet-row">
        <div className="sheet-icon"><Sheet size={24} /></div>
        <div className="grow"><b>Live Contacts Sheet</b><small>Connected through Google Sheets API</small></div>
        <span className="status-dot"></span><span className="connected">Connected</span>
      </div>
      <div className="card-footer"><small>Last synced: {syncedAt ? new Date(syncedAt).toLocaleString() : 'Not synced'}</small><button className="btn secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh Contacts'}</button></div>
    </section>
  );
}
