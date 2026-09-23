import { CheckCircle2, ListTree } from 'lucide-react';
import type { MessageSeries, WhatsAppTemplate } from '../types';

export function SeriesSelectionPanel({
  series,
  selectedId,
  onSelect,
  templates,
}: {
  series: MessageSeries[];
  selectedId: string;
  onSelect: (id: string) => void;
  templates: WhatsAppTemplate[];
}) {
  const readySeries = series.filter((item) => item.status === 'READY');
  const selected = readySeries.find((item) => item.id === selectedId);

  const templateForStep = (templateName: string, language: string) =>
    templates.find((template) =>
      template.name === templateName && template.language === language,
    );

  const previewDynamicValue = (value: string) =>
    String(value || '').replace(
      /\{\{\s*(name|phone|category)\s*\}\}/gi,
      (_, key: string) => ({
        name: 'Contact Name',
        phone: '919876543210',
        category: 'General',
      }[key.toLowerCase()] || ''),
    );

  const renderPreviewBody = (body: string, values: Record<string, string>) =>
    String(body || '').replace(
      /\{\{\s*(\d+)\s*\}\}/g,
      (_, key: string) => previewDynamicValue(values[key] || `{{${key}}}`),
    );

  return (
    <section className="card soft-orange series-selection-card">
      <div className="section-title orange-text">
        <span className="step orange">3</span>
        Select Message Series
      </div>

      <div className="series-select-row">
        <ListTree size={18}/>
        <select value={selectedId} onChange={(event) => onSelect(event.target.value)}>
          <option value="">Choose saved series</option>
          {readySeries.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.steps.length} day{item.steps.length === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        {selected && <span className="pill ok">READY</span>}
      </div>

      {!readySeries.length && (
        <div className="series-selection-empty">
          No ready series yet. Open <b>Message Templates → Series Messages</b> to create one.
        </div>
      )}

      {selected && (
        <>
          <div className="series-selected-summary">
            <CheckCircle2 size={18}/>
            <div>
              <b>{selected.name}</b>
              <span>
                {selected.steps.length} different daily message{selected.steps.length === 1 ? '' : 's'}
                {selected.description ? ' · ' + selected.description : ''}
              </span>
            </div>
          </div>

          <div className="series-step-preview-list">
            {selected.steps
              .slice()
              .sort((a, b) => a.dayNumber - b.dayNumber)
              .map((step) => {
                const template = templateForStep(step.templateName, step.templateLanguage);
                const body = renderPreviewBody(template?.body || '', step.variableValues || {});
                return (
                  <article key={step.dayNumber} className="series-step-preview-item">
                    <span className="series-step-preview-day">Day {step.dayNumber}</span>
                    <div className="series-step-preview-content">
                      <div className="series-step-preview-meta">
                        <b>{step.templateName}</b>
                        <small>
                          {step.templateLanguage}
                          {step.headerType ? ' · ' + step.headerType : ''}
                        </small>
                      </div>

                      <div className="wa-bg series-selection-wa-preview">
                        <div className="message-bubble preview-bubble series-preview-bubble">
                          {step.mediaUrl && step.headerType === 'IMAGE' && (
                            <img
                              className="preview-media"
                              src={step.mediaUrl}
                              alt={`Day ${step.dayNumber} media preview`}
                            />
                          )}
                          {step.mediaUrl && step.headerType === 'VIDEO' && (
                            <video
                              className="preview-media"
                              src={step.mediaUrl}
                              controls
                              preload="metadata"
                            />
                          )}
                          {step.headerType && !step.mediaUrl && (
                            <div className="preview-media-placeholder">
                              {step.headerType.toLowerCase()} not uploaded
                            </div>
                          )}
                          <div className="preview-message-text">
                            {body || 'Template preview unavailable.'}
                          </div>
                          <small>Preview</small>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        </>
      )}
    </section>
  );
}
