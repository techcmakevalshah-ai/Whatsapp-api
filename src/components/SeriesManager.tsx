import { Ban, Copy, Image as ImageIcon, Pencil, Plus, Save, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  createMessageSeries,
  disableMessageSeries,
  getMessageSeries,
  updateMessageSeries,
} from '../lib/api';
import { supabase } from '../lib/supabase';
import type { ManagedWhatsAppTemplate, MessageSeries, MessageSeriesStep } from '../types';

type EditableStep = MessageSeriesStep & { uploading?: boolean; uploadError?: string };

const MAX_MEDIA_SIZE = 100 * 1024 * 1024;
const PREVIEW_DYNAMIC_VALUES: Record<string, string> = {
  name: 'Contact Name',
  phone: '919876543210',
  category: 'General',
};

function previewDynamicValue(value: string) {
  return String(value || '').replace(
    /\{\{\s*(name|phone|category)\s*\}\}/gi,
    (_, key: string) => PREVIEW_DYNAMIC_VALUES[key.toLowerCase()] || '',
  );
}

function renderPreviewBody(body: string, values: Record<string, string>) {
  return String(body || '').replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (_, key: string) => previewDynamicValue(values[key] || `{{${key}}}`),
  );
}

function emptyStep(dayNumber: number): EditableStep {
  return {
    dayNumber,
    templateName: '',
    templateLanguage: 'en',
    headerType: null,
    mediaUrl: null,
    variableValues: {},
  };
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export function SeriesManager({
  templates,
  onSeriesChanged,
}: {
  templates: ManagedWhatsAppTemplate[];
  onSeriesChanged?: () => void | Promise<void>;
}) {
  const approvedTemplates = useMemo(
    () => templates.filter((template) => template.status === 'APPROVED'),
    [templates],
  );

  const [seriesList, setSeriesList] = useState<MessageSeries[]>([]);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<EditableStep[]>([emptyStep(1)]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMessageSeries();
      setSeriesList(data.series);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load message series.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const reset = () => {
    setEditingId('');
    setName('');
    setDescription('');
    setSteps([emptyStep(1)]);
    setError('');
  };

  const templateForStep = (step: EditableStep) =>
    approvedTemplates.find(
      (template) =>
        template.name === step.templateName &&
        template.language === step.templateLanguage,
    );

  const setStep = (index: number, patch: Partial<EditableStep>) => {
    setSteps((previous) => previous.map((step, stepIndex) =>
      stepIndex === index ? { ...step, ...patch } : step,
    ));
  };

  const selectTemplate = (index: number, templateId: string) => {
    const template = approvedTemplates.find((item) => item.id === templateId);
    if (!template) {
      setStep(index, {
        templateName: '',
        templateLanguage: 'en',
        headerType: null,
        mediaUrl: null,
        variableValues: {},
      });
      return;
    }

    setStep(index, {
      templateName: template.name,
      templateLanguage: template.language,
      headerType: template.headerType || null,
      mediaUrl: null,
      variableValues: {},
      uploadError: '',
    });
  };

  const addDay = () => {
    if (steps.length >= 90) return;
    setSteps((previous) => [...previous, emptyStep(previous.length + 1)]);
  };

  const duplicatePreviousDay = () => {
    if (!steps.length || steps.length >= 90) return;
    const previous = steps[steps.length - 1];
    setSteps((current) => [
      ...current,
      {
        ...previous,
        id: undefined,
        dayNumber: current.length + 1,
        variableValues: { ...previous.variableValues },
        uploading: false,
        uploadError: '',
      },
    ]);
  };

  const removeLastDay = () => {
    if (steps.length <= 1) return;
    setSteps((previous) => previous.slice(0, -1));
  };

  const uploadMedia = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const step = steps[index];
    const template = templateForStep(step);

    if (!file || !template?.headerType || !['IMAGE', 'VIDEO'].includes(template.headerType)) return;

    setStep(index, { uploading: true, uploadError: '' });

    try {
      if (template.headerType === 'IMAGE' && !file.type.startsWith('image/')) {
        throw new Error('This template requires an image file.');
      }
      if (template.headerType === 'VIDEO' && !file.type.startsWith('video/')) {
        throw new Error('This template requires a video file.');
      }
      if (file.size > MAX_MEDIA_SIZE) {
        throw new Error('File is too large. Maximum upload size is 100 MB.');
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const base = safeFileName(file.name.replace(/\.[^.]+$/, '')) || 'media';
      const path = `series/day-${step.dayNumber}/${Date.now()}-${crypto.randomUUID()}-${base}${ext ? `.${ext}` : ''}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-template-media')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('whatsapp-template-media')
        .getPublicUrl(path);

      if (!data.publicUrl) throw new Error('Unable to create media URL.');

      setStep(index, {
        mediaUrl: data.publicUrl,
        uploading: false,
        uploadError: '',
      });
    } catch (err) {
      setStep(index, {
        uploading: false,
        uploadError: err instanceof Error ? err.message : 'Media upload failed.',
      });
    } finally {
      event.target.value = '';
    }
  };

  const save = async () => {
    setError('');

    if (!name.trim()) {
      setError('Enter a series name.');
      return;
    }

    for (const step of steps) {
      const template = templateForStep(step);
      if (!template) {
        setError(`Choose an approved template for Day ${step.dayNumber}.`);
        return;
      }

      for (let index = 1; index <= template.variables; index += 1) {
        if (!String(step.variableValues[String(index)] || '').trim()) {
          setError(`Day ${step.dayNumber}: fill variable {{${index}}}.`);
          return;
        }
      }

      if (
        template.headerType &&
        ['IMAGE', 'VIDEO'].includes(template.headerType) &&
        !String(step.mediaUrl || '').trim()
      ) {
        setError(`Day ${step.dayNumber}: upload the required ${template.headerType.toLowerCase()}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        steps: steps.map(({ uploading: _uploading, uploadError: _uploadError, ...step }) => step),
      };

      if (editingId) await updateMessageSeries(editingId, payload);
      else await createMessageSeries(payload);

      reset();
      await load();
      await onSeriesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save message series.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (series: MessageSeries) => {
    setEditingId(series.id);
    setName(series.name);
    setDescription(series.description || '');
    setSteps(
      series.steps.length
        ? series.steps
            .sort((a, b) => a.dayNumber - b.dayNumber)
            .map((step) => ({ ...step, variableValues: { ...step.variableValues } }))
        : [emptyStep(1)],
    );
    setError('');
  };

  const disable = async (series: MessageSeries) => {
    const ok = window.confirm(
      `Disable series "${series.name}"? Existing scheduled runs are not deleted, but this series will not be available for new schedules.`,
    );
    if (!ok) return;

    try {
      await disableMessageSeries(series.id);
      if (editingId === series.id) reset();
      await load();
      await onSeriesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disable series.');
    }
  };

  return (
    <div className="series-manager-layout">
      <section className="series-builder">
        <div className="series-builder-head">
          <div>
            <h3>{editingId ? 'Edit Message Series' : 'Create Message Series'}</h3>
            <p>Different approved WhatsApp message for each day, up to 90 days.</p>
          </div>
          {editingId && (
            <button className="btn secondary" type="button" onClick={reset}>
              <Plus size={15}/> New Series
            </button>
          )}
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="series-main-fields">
          <label>
            <span>Series Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. 30 Day Dholera Education Series"
            />
          </label>
          <label>
            <span>Description <small>(optional)</small></span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Internal note about this series"
            />
          </label>
        </div>

        <div className="series-toolbar">
          <b>{steps.length} day{steps.length === 1 ? '' : 's'}</b>
          <div>
            <button className="btn secondary" type="button" onClick={addDay} disabled={steps.length >= 90}>
              <Plus size={14}/> Add Day
            </button>
            <button className="btn secondary" type="button" onClick={duplicatePreviousDay} disabled={steps.length >= 90}>
              <Copy size={14}/> Duplicate Previous
            </button>
            <button className="btn danger-outline" type="button" onClick={removeLastDay} disabled={steps.length <= 1}>
              Remove Last
            </button>
          </div>
        </div>

        <div className="series-step-list">
          {steps.map((step, index) => {
            const selectedTemplate = templateForStep(step);
            const selectedTemplateId = selectedTemplate?.id || '';

            return (
              <article key={step.dayNumber} className="series-step-card">
                <div className="series-day-badge">Day {step.dayNumber}</div>

                <label className="series-template-select">
                  <span>Approved Template</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => selectTemplate(index, event.target.value)}
                  >
                    <option value="">Choose template</option>
                    {approvedTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.language}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedTemplate && (
                  <>
                    <div className="series-template-preview">
                      <b>{selectedTemplate.name}</b>
                      <small>
                        {selectedTemplate.category}
                        {selectedTemplate.headerType ? ` · ${selectedTemplate.headerType}` : ''}
                      </small>
                      <div>{selectedTemplate.body}</div>
                    </div>

                    {selectedTemplate.variables > 0 && (
                      <div className="series-variable-grid">
                        {Array.from({ length: selectedTemplate.variables }, (_, variableIndex) => {
                          const key = String(variableIndex + 1);
                          return (
                            <label key={key}>
                              <span>{`{{${key}}}`}</span>
                              <input
                                value={step.variableValues[key] || ''}
                                onChange={(event) => setStep(index, {
                                  variableValues: {
                                    ...step.variableValues,
                                    [key]: event.target.value,
                                  },
                                })}
                                placeholder={variableIndex === 0 ? '{{name}} or fixed value' : 'Enter value'}
                              />
                            </label>
                          );
                        })}
                        <small className="series-variable-help">
                          Dynamic values supported: <code>{'{{name}}'}</code>, <code>{'{{phone}}'}</code>, <code>{'{{category}}'}</code>.
                        </small>
                      </div>
                    )}

                    {selectedTemplate.headerType && ['IMAGE', 'VIDEO'].includes(selectedTemplate.headerType) && (
                      <div className="series-media-row">
                        <label className="media-upload-button">
                          <Upload size={16}/>
                          <span>
                            {step.uploading
                              ? 'Uploading…'
                              : `Upload ${selectedTemplate.headerType === 'IMAGE' ? 'Image' : 'Video'} · max 100 MB`}
                          </span>
                          <input
                            hidden
                            type="file"
                            disabled={step.uploading}
                            accept={selectedTemplate.headerType === 'IMAGE'
                              ? 'image/jpeg,image/png,image/webp'
                              : 'video/mp4,video/3gpp'}
                            onChange={(event) => void uploadMedia(index, event)}
                          />
                        </label>

                        {step.mediaUrl && (
                          <div className="series-media-preview">
                            {selectedTemplate.headerType === 'IMAGE'
                              ? <img src={step.mediaUrl} alt={`Day ${step.dayNumber} media`}/>
                              : <video src={step.mediaUrl} controls preload="metadata"/>}
                            <span><ImageIcon size={14}/> Media ready</span>
                          </div>
                        )}

                        {step.uploadError && <div className="inline-error">{step.uploadError}</div>}
                      </div>
                    )}

                    <div className="series-live-preview">
                      <div className="series-live-preview-head">
                        <b>Message Preview</b>
                        <small>Day {step.dayNumber}</small>
                      </div>
                      <div className="wa-bg series-wa-preview">
                        <div className="message-bubble preview-bubble series-preview-bubble">
                          {step.mediaUrl && selectedTemplate.headerType === 'IMAGE' && (
                            <img
                              className="preview-media"
                              src={step.mediaUrl}
                              alt={`Day ${step.dayNumber} preview`}
                            />
                          )}
                          {step.mediaUrl && selectedTemplate.headerType === 'VIDEO' && (
                            <video
                              className="preview-media"
                              src={step.mediaUrl}
                              controls
                              preload="metadata"
                            />
                          )}
                          {selectedTemplate.headerType && !step.mediaUrl && (
                            <div className="preview-media-placeholder">
                              Upload the {selectedTemplate.headerType.toLowerCase()} to preview it here.
                            </div>
                          )}
                          <div className="preview-message-text">
                            {renderPreviewBody(selectedTemplate.body, step.variableValues)}
                          </div>
                          {selectedTemplate.footer && (
                            <div className="series-preview-footer">{selectedTemplate.footer}</div>
                          )}
                          <small>Preview</small>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>

        <button className="send-btn series-save-button" type="button" onClick={() => void save()} disabled={saving}>
          <Save size={17}/>
          {saving ? 'Saving Series…' : editingId ? 'Update Message Series' : 'Save Message Series'}
        </button>
      </section>

      <aside className="series-library">
        <div className="template-library-head">
          <h3>Saved Series</h3>
          <span>{seriesList.length} saved</span>
        </div>

        {loading ? (
          <div className="empty-state">Loading series…</div>
        ) : seriesList.length ? (
          <div className="series-library-list">
            {seriesList.map((series) => (
              <article key={series.id} className="series-library-item">
                <div className="template-library-title">
                  <div>
                    <b>{series.name}</b>
                    <small>{series.steps.length} day{series.steps.length === 1 ? '' : 's'}</small>
                  </div>
                  <span className={`pill ${series.status === 'READY' ? 'ok' : 'muted'}`}>
                    {series.status}
                  </span>
                </div>

                {series.description && <p>{series.description}</p>}

                <div className="series-mini-days">
                  {series.steps.slice(0, 6).map((step) => (
                    <span key={step.dayNumber}>D{step.dayNumber}: {step.templateName}</span>
                  ))}
                  {series.steps.length > 6 && <span>+{series.steps.length - 6} more</span>}
                </div>

                <div className="template-library-actions">
                  <button className="btn secondary" type="button" onClick={() => edit(series)}>
                    <Pencil size={14}/> Edit
                  </button>
                  {series.status !== 'INACTIVE' && (
                    <button className="btn danger-outline" type="button" onClick={() => void disable(series)}>
                      <Ban size={14}/> Disable
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No message series yet.</div>
        )}
      </aside>
    </div>
  );
}
