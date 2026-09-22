import { CheckCircle2, Link2, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { WhatsAppTemplate } from '../types';

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedName, setUploadedName] = useState('');
  const selected = templates.find((template) => template.id === selectedId);
  const mediaHeader = selected?.headerType && ['IMAGE', 'VIDEO'].includes(selected.headerType);

  const uploadMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selected?.headerType) return;

    setUploadError('');
    setUploading(true);

    try {
      const expectedImage = selected.headerType === 'IMAGE';
      if (expectedImage && !file.type.startsWith('image/')) {
        throw new Error('This template requires an image file.');
      }
      if (!expectedImage && !file.type.startsWith('video/')) {
        throw new Error('This template requires a video file.');
      }
      if (file.size > 16 * 1024 * 1024) {
        throw new Error('File is too large. Maximum upload size is 16 MB.');
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const base = safeFileName(file.name.replace(/\.[^.]+$/, '')) || 'media';
      const path = `${selected.name}/${Date.now()}-${crypto.randomUUID()}-${base}${ext ? `.${ext}` : ''}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-template-media')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('whatsapp-template-media')
        .getPublicUrl(path);

      if (!data.publicUrl) throw new Error('Unable to create a public media URL.');

      onMediaUrlChange(data.publicUrl);
      setUploadedName(file.name);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Media upload failed.');
      onMediaUrlChange('');
      setUploadedName('');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <section className="card soft-orange">
      <div className="section-title orange-text"><span className="step orange">3</span> Select WhatsApp Template</div>
      {error && <div className="inline-error">{error}</div>}
      <div className="template-grid">
        <div>
          <div className="row gap">
            <select value={selectedId} onChange={(e) => {
              onSelect(e.target.value);
              setUploadError('');
              setUploadedName('');
            }} disabled={loading}>
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
        <div className="media-upload-card">
          <div className="media-label">
            {selected?.headerType} Header
            <span>Upload the media approved for this campaign template</span>
          </div>

          <label className="media-upload-button">
            <Upload size={18}/>
            <span>{uploading ? 'Uploading…' : `Upload ${selected?.headerType === 'IMAGE' ? 'Image' : 'Video'}`}</span>
            <input
              type="file"
              hidden
              disabled={uploading}
              accept={selected?.headerType === 'IMAGE' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/3gpp'}
              onChange={uploadMedia}
            />
          </label>

          {mediaUrl && (
            <div className="media-upload-success">
              <CheckCircle2 size={16}/>
              <div>
                <b>{uploadedName || 'Media ready'}</b>
                <small>Uploaded and ready to send.</small>
              </div>
            </div>
          )}

          {uploadError && <div className="inline-error">{uploadError}</div>}

          <details className="media-url-fallback">
            <summary>Use an existing public media URL instead</summary>
            <div className="search">
              <Link2 size={16}/>
              <input
                value={mediaUrl}
                onChange={(e) => {
                  onMediaUrlChange(e.target.value);
                  setUploadedName('');
                }}
                placeholder="https://example.com/media-file"
              />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
