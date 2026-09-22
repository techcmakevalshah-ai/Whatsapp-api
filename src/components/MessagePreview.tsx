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

export function MessagePreview({
  template,
  values,
  contact,
  mediaUrl,
}: {
  template?: WhatsAppTemplate;
  values: Record<string,string>;
  contact?: Contact;
  mediaUrl?: string;
}) {
  return (
    <section className="card soft-blue">
      <div className="section-title blue-text">
        <span className="step blue">4</span>
        Message Preview
        {contact && <small>for {contact.name}</small>}
      </div>

      <div className="wa-bg">
        <div className="message-bubble preview-bubble">
          {template?.headerType === 'IMAGE' && mediaUrl && (
            <img className="preview-media" src={mediaUrl} alt="Uploaded template header" />
          )}

          {template?.headerType === 'VIDEO' && mediaUrl && (
            <video className="preview-media" src={mediaUrl} controls preload="metadata" />
          )}

          {template?.headerType && !mediaUrl && (
            <div className="preview-media-placeholder">
              Upload the {template.headerType.toLowerCase()} to preview it here.
            </div>
          )}

          <div className="preview-message-text">
            {renderBody(template?.body || '', values, contact)
              .split('\n')
              .map((line, i) => <div key={i}>{line || <br/>}</div>)}
          </div>

          <small>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      </div>
    </section>
  );
}
