import { getFlowluContactsSmart } from './flowluCache.js';
import { fetchSheetContacts } from './googleSheets.js';

export type ContactSource = 'sheet' | 'flowlu';
export function normalizeContactSource(value: unknown): ContactSource {
  return String(value || '').trim().toLowerCase() === 'flowlu' ? 'flowlu' : 'sheet';
}
export async function fetchContactsForSource(sourceValue: unknown, options?: { force?: boolean }) {
  const source = normalizeContactSource(sourceValue);
  if (source === 'flowlu') {
    return (await getFlowluContactsSmart(Boolean(options?.force))).contacts;
  }
  return fetchSheetContacts();
}
const SOURCE_PREFIX = '__contact_source__:';
export function encodeSourceCategory(sourceValue: unknown, category: string) {
  return SOURCE_PREFIX + normalizeContactSource(sourceValue) + '|' + String(category || 'Contact');
}
export function decodeSourceCategory(value: unknown) {
  const text = String(value || '');
  if (!text.startsWith(SOURCE_PREFIX)) {
    return { source: 'sheet' as ContactSource, category: text || 'Contact', marked: false };
  }
  const encoded = text.slice(SOURCE_PREFIX.length);
  const separator = encoded.indexOf('|');
  const source = normalizeContactSource(separator >= 0 ? encoded.slice(0, separator) : encoded);
  const category = separator >= 0 ? encoded.slice(separator + 1) : 'Contact';
  return { source, category: category || 'Contact', marked: true };
}
export function contactSourceFromRecipientMarkers(rows: Array<{ initial_category?: string | null }>): ContactSource {
  for (const row of rows || []) {
    const value = String(row?.initial_category || '');
    if (!value.startsWith(SOURCE_PREFIX)) continue;
    return normalizeContactSource(value.slice(SOURCE_PREFIX.length).split('|', 1)[0]);
  }
  return 'sheet';
}
