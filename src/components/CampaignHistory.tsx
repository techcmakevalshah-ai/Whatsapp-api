import { X } from 'lucide-react';
import type { CampaignSummary } from '../types';

export function CampaignHistory({ open, campaigns, loading, error, onClose }: {
  open: boolean;
  campaigns: CampaignSummary[];
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="history-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><h2>Campaign History</h2><p>Latest 50 campaigns</p></div><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
        {error && <div className="alert">{error}</div>}
        {loading ? <div className="empty-state">Loading campaigns…</div> : campaigns.length ? (
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Template</th><th>Recipients</th><th>Status</th><th>Created</th></tr></thead><tbody>
            {campaigns.map((campaign) => <tr key={campaign.id}><td><b>{campaign.name}</b></td><td>{campaign.templateName}</td><td>{campaign.totalRecipients}</td><td><span className="pill muted">{campaign.status}</span></td><td>{new Date(campaign.createdAt).toLocaleString()}</td></tr>)}
          </tbody></table></div>
        ) : <div className="empty-state">No campaigns yet.</div>}
      </section>
    </div>
  );
}
