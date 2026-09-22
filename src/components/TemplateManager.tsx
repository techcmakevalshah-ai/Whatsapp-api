import { Ban, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createManagedTemplate,
  disableManagedTemplate,
  getManagedTemplates,
  updateManagedTemplate,
} from '../lib/api';
import type { ManagedWhatsAppTemplate } from '../types';

type FormState = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  footer: string;
  status: 'DRAFT' | 'APPROVED';
  headerType: '' | 'IMAGE' | 'VIDEO';
  confirmProviderApproved: boolean;
};

const emptyForm: FormState = {
  id: '',
  name: '',
  language: 'en',
  category: 'UTILITY',
  body: '',
  footer: '',
  status: 'DRAFT',
  headerType: '',
  confirmProviderApproved: false,
};

function variableCount(body: string) {
  const values = [...body.matchAll(/{{\s*(\d+)\s*}}/g)].map((match) => Number(match[1]));
  return values.length ? Math.max(...values) : 0;
}

export function TemplateManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [templates, setTemplates] = useState<ManagedWhatsAppTemplate[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const detectedVariables = useMemo(() => variableCount(form.body), [form.body]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getManagedTemplates();
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  if (!open) return null;

  const reset = () => setForm(emptyForm);

  const edit = (template: ManagedWhatsAppTemplate) => {
    setForm({
      id: template.id,
      name: template.name,
      language: template.language,
      category: template.category || 'UTILITY',
      body: template.body,
      footer: template.footer || '',
      status: template.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
      headerType: template.headerType || '',
      confirmProviderApproved: template.status === 'APPROVED',
    });
    setError('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        name: form.name.trim(),
        language: form.language.trim(),
        category: form.category,
        body: form.body,
        footer: form.footer,
        status: form.status,
        headerType: form.headerType || null,
        confirmProviderApproved: form.status === 'APPROVED' ? form.confirmProviderApproved : false,
      };

      if (form.id) await updateManagedTemplate(form.id, payload);
      else await createManagedTemplate(payload);

      reset();
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template.');
    } finally {
      setSaving(false);
    }
  };

  const disable = async (template: ManagedWhatsAppTemplate) => {
    const ok = window.confirm(`Disable "${template.name}"? It will disappear from the campaign dropdown.`);
    if (!ok) return;

    setError('');
    try {
      await disableManagedTemplate(template.id);
      if (form.id === template.id) reset();
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disable template.');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="template-manager" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Message Templates</h2>
            <p>Add templates that have already been created in OfficialWA.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="template-notice">
          <b>Approval note:</b> marking a template Approved here does not submit it to WhatsApp.
          Use Approved only after OfficialWA has approved the exact template name, language and text.
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="template-manager-grid">
          <form className="template-form" onSubmit={save}>
            <div className="template-form-head">
              <div>
                <h3>{form.id ? 'Edit Template' : 'Add Template'}</h3>
                <small>{detectedVariables} body variable{detectedVariables === 1 ? '' : 's'} detected</small>
              </div>
              {form.id && <button type="button" className="btn secondary" onClick={reset}><Plus size={15}/> New</button>}
            </div>

            <div className="template-form-row two">
              <label>
                <span>OfficialWA Template Name</span>
                <input
                  required
                  placeholder="e.g. webinar_reminder_1"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                />
              </label>

              <label>
                <span>Language</span>
                <input
                  required
                  placeholder="en"
                  value={form.language}
                  onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
                />
              </label>
            </div>

            <div className="template-form-row two">
              <label>
                <span>Category</span>
                <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                  <option value="UTILITY">Utility</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </label>

              <label>
                <span>Local Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    status: e.target.value as 'DRAFT' | 'APPROVED',
                    confirmProviderApproved: false,
                  }))}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="APPROVED">Approved in OfficialWA</option>
                </select>
              </label>
            </div>


            <div className="template-form-row two">
              <label>
                <span>Header Media</span>
                <select
                  value={form.headerType}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    headerType: e.target.value as '' | 'IMAGE' | 'VIDEO',
                  }))}
                >
                  <option value="">No media header</option>
                  <option value="IMAGE">Image header</option>
                  <option value="VIDEO">Video header</option>
                </select>
              </label>
              <div className="template-media-help">
                {form.headerType
                  ? `This template requires a ${form.headerType.toLowerCase()} upload each time you send a campaign.`
                  : 'Use this only if the approved OfficialWA template has an image or video header.'}
              </div>
            </div>

            <label>
              <span>Exact Approved Body</span>
              <textarea
                required
                rows={9}
                placeholder={'Paste the exact template text. Use {{1}}, {{2}}, {{3}} ... exactly where OfficialWA has variables.'}
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              />
            </label>

            <label>
              <span>Footer <small>(optional)</small></span>
              <input
                placeholder="Optional footer text"
                value={form.footer}
                onChange={(e) => setForm((prev) => ({ ...prev, footer: e.target.value }))}
              />
            </label>

            {form.status === 'APPROVED' && (
              <label className="approval-confirm">
                <input
                  type="checkbox"
                  checked={form.confirmProviderApproved}
                  onChange={(e) => setForm((prev) => ({ ...prev, confirmProviderApproved: e.target.checked }))}
                />
                <span>I confirm this exact template is already approved in OfficialWA.</span>
              </label>
            )}

            <button
              className="send-btn"
              disabled={saving || (form.status === 'APPROVED' && !form.confirmProviderApproved)}
            >
              {saving ? 'Saving…' : form.id ? 'Update Template' : 'Add Template'}
            </button>
          </form>

          <div className="template-library">
            <div className="template-library-head">
              <h3>Template Library</h3>
              <span>{templates.length} saved</span>
            </div>

            {loading ? (
              <div className="empty-state">Loading templates…</div>
            ) : templates.length ? (
              <div className="template-library-list">
                {templates.map((template) => (
                  <article key={template.id} className="template-library-item">
                    <div className="template-library-title">
                      <div>
                        <b>{template.name}</b>
                        <small>{template.language} · {template.category}{template.headerType ? ` · ${template.headerType}` : ''}</small>
                      </div>
                      <span className={`pill ${template.status === 'APPROVED' ? 'ok' : template.status === 'DISABLED' ? 'muted' : 'pending-pill'}`}>
                        {template.status}
                      </span>
                    </div>

                    <div className="template-library-body">{template.body}</div>
                    <div className="template-library-meta">{template.variables} variable{template.variables === 1 ? '' : 's'}</div>

                    <div className="template-library-actions">
                      <button className="btn secondary" onClick={() => edit(template)}><Pencil size={14}/> Edit</button>
                      {template.status !== 'DISABLED' && (
                        <button className="btn danger-outline" onClick={() => void disable(template)}>
                          <Ban size={14}/> Disable
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">No templates saved yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
