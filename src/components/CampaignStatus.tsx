import type { RecipientStatus } from '../types';

function pillClass(status: RecipientStatus['status']) {
  if (status === 'Failed') return 'bad';
  if (status === 'Read') return 'read';
  if (status === 'Queued' || status === 'Processing') return 'muted';
  return 'ok';
}

export function CampaignStatus({ rows }: { rows: RecipientStatus[] }) {
  if (!rows.length) return null;
  return (
    <section className="card status-card">
      <div className="section-title purple-text"><span className="step purple">6</span> Campaign Status</div>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Status</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Error</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.name}</td><td>+{row.phone}</td><td><span className={`pill ${pillClass(row.status)}`}>{row.status}</span></td><td>{row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}</td><td>{row.deliveredAt ? new Date(row.deliveredAt).toLocaleString() : '—'}</td><td>{row.readAt ? new Date(row.readAt).toLocaleString() : '—'}</td><td>{row.error || '—'}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}
