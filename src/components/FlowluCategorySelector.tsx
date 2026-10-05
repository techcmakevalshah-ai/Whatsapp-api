import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

type FlowluCategory = {
  id: number;
  name: string;
  active: boolean;
};

const COOKIE_NAME = 'flowlu_category_id';
const STORAGE_ID = 'flowluCategoryId';
const STORAGE_NAME = 'flowluCategoryName';

function setCategoryPreference(id: string, name: string) {
  if (typeof window !== 'undefined') {
    if (id) {
      window.localStorage.setItem(STORAGE_ID, id);
      window.localStorage.setItem(STORAGE_NAME, name);
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } else {
      window.localStorage.removeItem(STORAGE_ID);
      window.localStorage.removeItem(STORAGE_NAME);
      document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }
}

async function authenticatedJson<T>(url: string): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

export function FlowluCategorySelector({
  loading,
  onApply,
  compact = false,
}: {
  loading?: boolean;
  onApply: () => void | Promise<void>;
  compact?: boolean;
}) {
  const [categories, setCategories] = useState<FlowluCategory[]>([]);
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(STORAGE_ID) || '';
  });
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingCategories(true);
    setError('');

    void authenticatedJson<{ categories: FlowluCategory[] }>('/api/contacts?action=flowlu-categories&source=flowlu')
      .then((data) => {
        if (!active) return;
        const next = (data.categories || []).filter((category) => category.active);
        setCategories(next);

        if (selectedId && !next.some((category) => String(category.id) === selectedId)) {
          setSelectedId('');
          setCategoryPreference('', '');
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load Flowlu segments.');
      })
      .finally(() => {
        if (active) setLoadingCategories(false);
      });

    return () => { active = false; };
  }, []);

  const change = async (value: string) => {
    setSelectedId(value);
    const category = categories.find((item) => String(item.id) === value);
    setCategoryPreference(value, category?.name || '');
    await onApply();
  };

  return (
    <div className={compact ? 'flowlu-category-picker compact' : 'flowlu-category-picker'}>
      <div className="flowlu-category-picker-label">
        <Database size={14}/>
        <span>Flowlu Segment</span>
      </div>
      <select
        value={selectedId}
        disabled={Boolean(loading) || loadingCategories}
        onChange={(event) => void change(event.target.value)}
      >
        <option value="">{loadingCategories ? 'Loading segments…' : 'Select segment first'}</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>
      {!compact && !selectedId && !error && (
        <small>Contacts are loaded only after you choose a segment.</small>
      )}
      {error && <small className="flowlu-category-error">{error}</small>}
    </div>
  );
}
