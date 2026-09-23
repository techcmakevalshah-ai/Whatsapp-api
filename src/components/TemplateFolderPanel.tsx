import { Archive, Folder, FolderOpen, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ManagedWhatsAppTemplate, TemplateFolder } from '../types';

export function TemplateFolderPanel({
  folders,
  templates,
  selectedFolder,
  onSelect,
  onCreate,
  onRename,
  onArchive,
}: {
  folders: TemplateFolder[];
  templates: ManagedWhatsAppTemplate[];
  selectedFolder: string;
  onSelect: (value: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (folder: TemplateFolder, name: string) => Promise<void>;
  onArchive: (folder: TemplateFolder) => Promise<void>;
}) {
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const countFor = (folderId: string | null) =>
    templates.filter((template) => (template.folderId || null) === folderId).length;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;

    setCreating(true);
    try {
      await onCreate(name);
      setNewFolderName('');
    } finally {
      setCreating(false);
    }
  };

  const rename = async (folder: TemplateFolder) => {
    const next = window.prompt('Rename template folder', folder.name)?.trim();
    if (!next || next === folder.name) return;
    await onRename(folder, next);
  };

  return (
    <aside className="template-folder-panel">
      <div className="template-folder-head">
        <div>
          <b>Folders</b>
          <small>Organize templates by purpose</small>
        </div>
      </div>

      <form className="template-folder-create" onSubmit={create}>
        <input
          value={newFolderName}
          onChange={(event) => setNewFolderName(event.target.value)}
          placeholder="New folder name"
          maxLength={60}
        />
        <button className="icon-btn folder-add-btn" disabled={creating || !newFolderName.trim()} title="Create folder">
          <Plus size={16}/>
        </button>
      </form>

      <div className="template-folder-list">
        <button
          className={'template-folder-item ' + (selectedFolder === 'all' ? 'active' : '')}
          onClick={() => onSelect('all')}
          type="button"
        >
          <FolderOpen size={16}/>
          <span>All Templates</span>
          <b>{templates.length}</b>
        </button>

        {folders.map((folder) => (
          <div key={folder.id} className={'template-folder-row ' + (selectedFolder === folder.id ? 'active' : '')}>
            <button
              className="template-folder-item"
              onClick={() => onSelect(folder.id)}
              type="button"
            >
              <Folder size={16}/>
              <span>{folder.name}</span>
              <b>{countFor(folder.id)}</b>
            </button>

            <div className="template-folder-actions">
              <button className="icon-btn" type="button" title="Rename folder" onClick={() => void rename(folder)}>
                <Pencil size={13}/>
              </button>
              <button className="icon-btn folder-archive-btn" type="button" title="Archive folder" onClick={() => void onArchive(folder)}>
                <Archive size={13}/>
              </button>
            </div>
          </div>
        ))}

        <button
          className={'template-folder-item ' + (selectedFolder === 'unfiled' ? 'active' : '')}
          onClick={() => onSelect('unfiled')}
          type="button"
        >
          <Folder size={16}/>
          <span>Unfiled</span>
          <b>{countFor(null)}</b>
        </button>
      </div>

      <div className="template-folder-note">
        Archiving a folder does not delete its templates. They move to Unfiled.
      </div>
    </aside>
  );
}
