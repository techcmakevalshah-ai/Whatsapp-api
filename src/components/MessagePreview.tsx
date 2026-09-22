import type { Contact, WhatsAppTemplate } from '../types';

function resolveTokenValue(value: string, contact?: Contact) {
  if (!contact) return value;
  const map: Record<string, string> = { name: contact.name, phone: contact.phone, category: contact.category };
  return value.replace(/\{\{?\s*(name|phone|category)\s*\}?\}/gi, (_, key: string) => map[key.toLowerCase()] || '');
}

function renderBody(body: string, values: Record<string, string>, contact?: Contact) {
  let text = body || 'Your approved WhatsApp template preview appears here.';
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{{${key}}}`, resolveTokenValue(value, contact) || `{{${key}}}`);
  }
  return text;
}

export function MessagePreview({ template, values, contact }: { template?: WhatsAppTemplate; values: Record<string,string>; contact?: Contact }) {
  return (
    <section className="card soft-blue">
      <div className="section-title blue-text"><span className="step blue">4</span> Message Preview {contact && <small>for {contact.name}</small>}</div>
      <div className="wa-bg">
        <div className="message-bubble">
          {renderBody(template?.body || '', values, contact).split('\n').map((line, i) => <div key={i}>{line || <br/>}</div>)}
          <small>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      </div>
    </section>
  );
}
