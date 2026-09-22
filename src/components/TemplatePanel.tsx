import { Link2 } from 'lucide-react';
import type { WhatsAppTemplate } from '../types';

export function TemplatePanel({ templates, selectedId, onSelect, variableValues, onVariableChange, mediaUrl, onMediaUrlChange, loading, error }: {
  templates: WhatsAppTemplate[];
  selectedId: string;
  onSelect: (v: string) => void;
  variableValues: Record<string, string>;
  onVariableChange: (index: number, value: string) => void;
  mediaUrl: string;
  onMediaUrlChange: (value: string) => void;
  loading: boolean;
  error?: string;
}) {
  const selected = templates.find((template) => template.id === selectedId);
  const mediaHeader = selected?.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.headerType);

  return (
    <section className="card soft-orange">
      <div className="section-title orange-text"><span className="step orange">3</span> Select WhatsApp Template</div>
      {error && <div className="inline-error">{error}</div>}
      <div className="template-grid">
        <div>
          <div className="row gap">
            <select value={selectedId} onChange={(e) => onSelect(e.target.value)} disabled={loading}>
              <option value="">{loading ? 'Loading templates…' : 'Choose approved template'}</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}
            </select>
            {selected && <span className="pill ok">{selected.status}</span>}
          </div>
          <div className="template-body">{selected?.body || 'Select an approved WhatsApp template to preview it.'}</div>
        </div>
        <div className="variables-card">
          <b>Template Variables</b>
          {selected && selected.variables > 0 ? Array.from({ length: selected.variables }, (_, i) => (
            <label key={i}>
              <span>{`{{${i + 1}}}`}</span>
              <input
                placeholder={i === 0 ? 'e.g. {{name}}' : `Value ${i + 1}`}
                value={variableValues[String(i + 1)] || ''}
                onChange={(e) => onVariableChange(i + 1, e.target.value)}
              />
            </label>
          )) : <small>No body variables detected.</small>}
          {selected && selected.variables > 0 && <small>Dynamic values: <code>{'{{name}}'}</code>, <code>{'{{phone}}'}</code>, <code>{'{{category}}'}</code>.</small>}
        </div>
      </div>
      {mediaHeader && (
        <div className="media-url-field">
          <div className="media-label">{selected?.headerType} Header <span>Public HTTPS media URL required</span></div>
          <div className="search"><Link2 size={16}/><input value={mediaUrl} onChange={(e) => onMediaUrlChange(e.target.value)} placeholder="https://example.com/media-file" /></div>
        </div>
      )}
    </section>
  );
}
