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

  const templateBody = (templateName: string, language: string) =>
    templates.find((template) =>
      template.name === templateName && template.language === language,
    )?.body || '';

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
                const body = templateBody(step.templateName, step.templateLanguage);
                return (
                  <article key={step.dayNumber} className="series-step-preview-item">
                    <span className="series-step-preview-day">Day {step.dayNumber}</span>
                    <div>
                      <b>{step.templateName}</b>
                      <small>
                        {step.templateLanguage}
                        {step.headerType ? ' · ' + step.headerType : ''}
                      </small>
                      {body && <p>{body}</p>}
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
