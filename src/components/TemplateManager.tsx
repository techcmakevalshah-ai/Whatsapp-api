import { Ban, Folder, ListTree, MessageSquareText, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  archiveTemplateFolder,
  createManagedTemplate,
  createTemplateFolder,
  disableManagedTemplate,
  getManagedTemplates,
  moveManagedTemplate,
  updateManagedTemplate,
  updateTemplateFolder,
} from '../lib/api';
import type { ManagedWhatsAppTemplate, TemplateFolder } from '../types';
import { SeriesManager } from './SeriesManager';
import { TemplateFolderPanel } from './TemplateFolderPanel';

type FormState = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  footer: string;
  status: 'DRAFT' | 'APPROVED';
  headerType: '' | 'IMAGE' | 'VIDEO';
  folderId: string;
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
  folderId: '',
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
  const [folders, setFolders] = useState<TemplateFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [activeTab, setActiveTab] = useState<'templates' | 'series'>('templates');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState('');
  const [error, setError] = useState('');
  const detectedVariables = useMemo(() => variableCount(form.body), [form.body]);

  const filteredTemplates = useMemo(() => {
    if (selectedFolder === 'all') return templates;
    if (selectedFolder === 'unfiled') return templates.filter((template) => !template.folderId);
    return templates.filter((template) => template.folderId === selectedFolder);
  }, [templates, selectedFolder]);

  const selectedFolderLabel = useMemo(() => {
    if (selectedFolder === 'all') return 'All Templates';
    if (selectedFolder === 'unfiled') return 'Unfiled';
    return folders.find((folder) => folder.id === selectedFolder)?.name || 'Folder';
  }, [folders, selectedFolder]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getManagedTemplates();
      setTemplates(data.templates);
      setFolders(data.folders || []);

      if (
        selectedFolder !== 'all' &&
        selectedFolder !== 'unfiled' &&
        !(data.folders || []).some((folder) => folder.id === selectedFolder)
      ) {
        setSelectedFolder('all');
      }
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

  const reset = () => setForm({
    ...emptyForm,
    folderId:
      selectedFolder !== 'all' && selectedFolder !== 'unfiled'
        ? selectedFolder
        : '',
  });

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
      folderId: template.folderId || '',
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
        folderId: form.folderId || null,
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

  const createFolder = async (name: string) => {
    setError('');
    try {
      const result = await createTemplateFolder({ name });
      await load();
      setSelectedFolder(result.folder.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create folder.');
      throw err;
    }
  };

  const renameFolder = async (folder: TemplateFolder, name: string) => {
    setError('');
    try {
      await updateTemplateFolder(folder.id, {
        name,
        description: folder.description || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename folder.');
      throw err;
    }
  };

  const archiveFolder = async (folder: TemplateFolder) => {
    const count = templates.filter((template) => template.folderId === folder.id).length;
    const ok = window.confirm(
      `Archive folder "${folder.name}"? ${count} template${count === 1 ? '' : 's'} will move to Unfiled. No templates will be deleted.`,
    );
    if (!ok) return;

    setError('');
    try {
      await archiveTemplateFolder(folder.id);
      if (selectedFolder === folder.id) setSelectedFolder('unfiled');
      if (form.folderId === folder.id) setForm((previous) => ({ ...previous, folderId: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive folder.');
      throw err;
    }
  };

  const moveTemplate = async (template: ManagedWhatsAppTemplate, folderId: string) => {
    setMovingId(template.id);
    setError('');

    try {
      await moveManagedTemplate(template.id, folderId || null);
      if (form.id === template.id) {
        setForm((previous) => ({ ...previous, folderId }));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to move template.');
    } finally {
      setMovingId('');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="template-manager" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Message Templates & Series</h2>
            <p>Organize approved templates in folders and build multi-day message series.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>

        <div className="template-manager-tabs">
          <button
            className={activeTab === 'templates' ? 'active' : ''}
            onClick={() => setActiveTab('templates')}
          >
            <MessageSquareText size={16}/> Template Library
          </button>
          <button
            className={activeTab === 'series' ? 'active' : ''}
            onClick={() => setActiveTab('series')}
          >
            <ListTree size={16}/> Series Messages
          </button>
        </div>

        {activeTab === 'templates' ? (
          <>
            <div className="template-notice">
              <b>Folders are for organization only.</b> A folder can contain Marketing, Utility, image,
              video and other approved templates together. Moving a template does not change OfficialWA.
            </div>

            {error && <div className="alert">{error}</div>}

            <div className="template-manager-grid template-manager-grid-folders">
              <form className="template-form" onSubmit={save}>
                <div className="template-form-head">
                  <div>
                    <h3>{form.id ? 'Edit Template' : 'Add Template'}</h3>
                    <small>{detectedVariables} body variable{detectedVariables === 1 ? '' : 's'} detected</small>
                  </div>
                  {form.id && (
                    <button type="button" className="btn secondary" onClick={reset}>
                      <Plus size={15}/> New
                    </button>
                  )}
                </div>

                <div className="template-form-row two">
                  <label>
                    <span>OfficialWA Template Name</span>
                    <input
                      required
                      placeholder="e.g. webinar_reminder_1"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        name: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                      }))}
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
                    <span>Folder</span>
                    <select
                      value={form.folderId}
                      onChange={(e) => setForm((prev) => ({ ...prev, folderId: e.target.value }))}
                    >
                      <option value="">Unfiled</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Category</span>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                    >
                      <option value="UTILITY">Utility</option>
                      <option value="MARKETING">Marketing</option>
                      <option value="AUTHENTICATION">Authentication</option>
                    </select>
                  </label>
                </div>

                <div className="template-form-row two">
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
                </div>

                {form.headerType && (
                  <div className="template-media-help">
                    This template requires a {form.headerType.toLowerCase()} upload when sending.
                  </div>
                )}

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
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        confirmProviderApproved: e.target.checked,
                      }))}
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

              <div className="template-library-workspace">
                <TemplateFolderPanel
                  folders={folders}
                  templates={templates}
                  selectedFolder={selectedFolder}
                  onSelect={setSelectedFolder}
                  onCreate={createFolder}
                  onRename={renameFolder}
                  onArchive={archiveFolder}
                />

                <div className="template-library">
                  <div className="template-library-head">
                    <div>
                      <h3>{selectedFolderLabel}</h3>
                      <small>
                        {filteredTemplates.length} template{filteredTemplates.length === 1 ? '' : 's'}
                      </small>
                    </div>
                    <span>{templates.length} total</span>
                  </div>

                  {loading ? (
                    <div className="empty-state">Loading templates…</div>
                  ) : filteredTemplates.length ? (
                    <div className="template-library-list">
                      {filteredTemplates.map((template) => {
                        const folderName =
                          folders.find((folder) => folder.id === template.folderId)?.name || 'Unfiled';

                        return (
                          <article key={template.id} className="template-library-item">
                            <div className="template-library-title">
                              <div>
                                <b>{template.name}</b>
                                <small>
                                  {template.language} · {template.category}
                                  {template.headerType ? ` · ${template.headerType}` : ''}
                                </small>
                              </div>
                              <span className={`pill ${
                                template.status === 'APPROVED'
                                  ? 'ok'
                                  : template.status === 'DISABLED'
                                    ? 'muted'
                                    : 'pending-pill'
                              }`}>
                                {template.status}
                              </span>
                            </div>

                            <div className="template-folder-chip">
                              <Folder size={13}/> {folderName}
                            </div>

                            <div className="template-library-body">{template.body}</div>
                            <div className="template-library-meta">
                              {template.variables} variable{template.variables === 1 ? '' : 's'}
                            </div>

                            <div className="template-card-footer">
                              <label className="template-move-select">
                                <span>Move to</span>
                                <select
                                  value={template.folderId || ''}
                                  disabled={movingId === template.id}
                                  onChange={(event) => void moveTemplate(template, event.target.value)}
                                >
                                  <option value="">Unfiled</option>
                                  {folders.map((folder) => (
                                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                                  ))}
                                </select>
                              </label>

                              <div className="template-library-actions">
                                <button className="btn secondary" type="button" onClick={() => edit(template)}>
                                  <Pencil size={14}/> Edit
                                </button>
                                {template.status !== 'DISABLED' && (
                                  <button
                                    className="btn danger-outline"
                                    type="button"
                                    onClick={() => void disable(template)}
                                  >
                                    <Ban size={14}/> Disable
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      No templates in this folder yet. Use the Move to control or choose this folder when adding a template.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <SeriesManager
            templates={templates}
            onSeriesChanged={onChanged}
          />
        )}
      </section>
    </div>
  );
}
