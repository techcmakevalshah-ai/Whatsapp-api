import type { SheetContact } from './googleSheets.js';

export function resolveContactValue(value: string, contact: SheetContact) {
  const replacements: Record<string, string> = {
    name: contact.name,
    phone: contact.phone,
    category: contact.category,
  };

  return String(value || '').replace(/\{\{?\s*(name|phone|category)\s*\}?\}/gi, (_, key: string) => {
    return replacements[key.toLowerCase()] || '';
  });
}

export function resolveVariableMap(values: Record<string, string>, contact: SheetContact, variableCount: number) {
  const output: Record<string, string> = {};
  for (let index = 1; index <= variableCount; index += 1) {
    const raw = values[String(index)] || '';
    const resolved = resolveContactValue(raw, contact).trim();
    if (!resolved) throw new Error(`Template variable {{${index}}} is empty for ${contact.name}.`);
    output[String(index)] = resolved;
  }
  return output;
}
