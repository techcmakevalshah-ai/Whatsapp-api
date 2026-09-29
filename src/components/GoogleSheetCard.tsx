import { Database, RefreshCw, Sheet } from 'lucide-react';
import type { ContactSource } from '../types';

export function GoogleSheetCard({ source, syncedAt, loading, onRefresh, onSourceChange, error }: {
  source: ContactSource;
  syncedAt?: string;
  loading: boolean;
  onRefresh: () => void;
  onSourceChange: (source: ContactSource) => void;
  error?: string;
}) {
  const connected = Boolean(syncedAt) && !error;
  const sourceName = source === 'flowlu' ? 'Flowlu CRM' : 'Excel / Google Sheet';
  return (
    <section className="card soft-green contact-source-card">
      <div className="section-title"><span className="step green">1</span> Contact Source</div>
      <div className="contact-source-toggle">
        <button type="button" className={source === 'sheet' ? 'active' : ''} onClick={() => onSourceChange('sheet')} disabled={loading}>
          <Sheet size={17}/><span><b>Excel Sheet</b><small>Google Sheets API</small></span>
        </button>
        <button type="button" className={source === 'flowlu' ? 'active' : ''} onClick={() => onSourceChange('flowlu')} disabled={loading}>
          <Database size={17}/><span><b>Flowlu CRM</b><small>Live CRM contacts</small></span>
        </button>
      </div>
      <div className="sheet-row">
        <div className="sheet-icon">{source === 'flowlu' ? <Database size={24}/> : <Sheet size={24}/>}</div>
        <div className="grow"><b>{sourceName}</b><small>{connected ? (source === 'flowlu' ? 'Connected through Flowlu CRM API' : 'Connected through Google Sheets API') : sourceName + ' connection required'}</small></div>
        <span className={connected ? 'status-dot' : 'status-dot status-dot-off'}></span>
        <span className={connected ? 'connected' : 'disconnected'}>{connected ? 'Connected' : 'Not connected'}</span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="card-footer">
        <small>Last synced: {syncedAt ? new Date(syncedAt).toLocaleString() : 'Not synced'}</small>
        <button className="btn secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> {loading ? 'Refreshing…' : 'Refresh Contacts'}</button>
      </div>
    </section>
  );
}
