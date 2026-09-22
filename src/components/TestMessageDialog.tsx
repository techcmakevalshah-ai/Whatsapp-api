import { Send, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { sendTestMessage } from '../lib/api';
import type { WhatsAppTemplate } from '../types';

export function TestMessageDialog({
  open,
  template,
  variableValues,
  mediaUrl,
  onClose,
}: {
  open: boolean;
  template?: WhatsAppTemplate;
  variableValues: Record<string, string>;
  mediaUrl: string;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!open) {
      setPhone('');
      setError('');
      setSuccess('');
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!template) {
      setError('Choose an approved template first.');
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setError('Enter a valid WhatsApp number with country code.');
      return;
    }

    if (
      template.headerType &&
      ['IMAGE', 'VIDEO'].includes(template.headerType) &&
      !mediaUrl.trim()
    ) {
      setError(`Upload the required ${template.headerType.toLowerCase()} before sending a test.`);
      return;
    }

    const missingVariable = Array.from(
      { length: template.variables },
      (_, index) => variableValues[String(index + 1)],
    ).some((value) => !value?.trim());

    if (missingVariable) {
      setError('Fill every template variable before sending a test.');
      return;
    }

    setSending(true);
    try {
      const result = await sendTestMessage({
        phone: digits,
        templateName: template.name,
        templateLanguage: template.language,
        variableValues,
        mediaUrl: mediaUrl.trim() || undefined,
      });

      setSuccess(`Test message accepted for number ending ${result.phoneLast4}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send test message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop test-modal-backdrop" onMouseDown={onClose}>
      <section className="test-message-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Send Test Message</h2>
            <p>Send this template once without creating a campaign.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="test-template-summary">
          <b>{template?.name || 'No template selected'}</b>
          <span>{template ? `${template.language} · ${template.headerType || 'Text only'}` : 'Choose a template first'}</span>
        </div>

        {error && <div className="alert">{error}</div>}
        {success && <div className="test-success">{success}</div>}

        <form className="test-message-form" onSubmit={submit}>
          <label>
            <span>Test WhatsApp Number</span>
            <input
              autoFocus
              inputMode="tel"
              placeholder="e.g. 919876543210"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <small>Include the country code. Example: India = 91 + mobile number.</small>
          </label>

          <div className="test-note">
            Dynamic values are resolved for testing as:
            <code>{'{{name}}'} → Test</code>,
            <code>{'{{phone}}'} → test number</code>,
            <code>{'{{category}}'} → Test</code>.
          </div>

          <button className="send-btn" disabled={sending || !template}>
            <Send size={17}/>
            {sending ? 'Sending Test…' : 'Send Test Message'}
          </button>
        </form>
      </section>
    </div>
  );
}
