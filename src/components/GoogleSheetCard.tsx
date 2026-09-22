import { RefreshCw, Sheet } from 'lucide-react';

export function GoogleSheetCard({ syncedAt, loading, onRefresh, error }: {
  syncedAt?: string;
  loading: boolean;
  onRefresh: () => void;
  error?: string;
}) {
  const connected = Boolean(syncedAt) && !error;
  return (
    <section className="card soft-green">
      <div className="section-title"><span className="step green">1</span> Connect Google Sheet</div>
      <div className="sheet-row">
        <div className="sheet-icon"><Sheet size={24} /></div>
        <div className="grow">
          <b>Live Contacts Sheet</b>
          <small>{connected ? 'Connected through Google Sheets API' : 'Google Sheets connection required'}</small>
        </div>
        <span className={connected ? 'status-dot' : 'status-dot status-dot-off'}></span>
        <span className={connected ? 'connected' : 'disconnected'}>{connected ? 'Connected' : 'Not connected'}</span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="card-footer">
        <small>Last synced: {syncedAt ? new Date(syncedAt).toLocaleString() : 'Not synced'}</small>
        <button className="btn secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh Contacts'}
        </button>
      </div>
    </section>
  );
}
