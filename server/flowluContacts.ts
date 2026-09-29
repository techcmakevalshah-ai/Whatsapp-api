export type FlowluContact = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: 'Active' | 'Inactive';
  source: 'flowlu';
};

function normalizePhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
  return digits.length === 10 && defaultCountryCode ? defaultCountryCode + digits : digits;
}

function flowluConfig() {
  let accountCode = String(process.env.FLOWLU_ACCOUNT_CODE || '').trim();
  const apiKey = String(process.env.FLOWLU_API_KEY || '').trim();
  accountCode = accountCode.replace(/^https?:\/\//i, '').replace(/\.flowlu\.com.*$/i, '').replace(/\/+$/, '').trim();
  if (!accountCode) throw new Error('FLOWLU_ACCOUNT_CODE is not configured for this app.');
  if (!apiKey) throw new Error('FLOWLU_API_KEY is not configured for this app.');
  return { apiKey, baseUrl: 'https://' + accountCode + '.flowlu.com/api/v1/module' };
}

async function flowluGet(path: string, query: Record<string, string | number> = {}) {
  const { apiKey, baseUrl } = flowluConfig();
  const url = new URL(baseUrl + '/' + String(path).replace(/^\/+/, ''));
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error('Flowlu returned an invalid response (' + response.status + ').'); }
  if (!response.ok || data?.error) {
    const message = data?.description || data?.error?.error_msg || data?.error?.message ||
      (typeof data?.error === 'string' ? data.error : '') || 'Flowlu request failed (' + response.status + ').';
    throw new Error(String(message));
  }
  return data;
}

function mapFlowluContact(row: any): FlowluContact | null {
  const type = Number(row?.type ?? row?.type_id ?? 0);
  if (type && type !== 2) return null;
  const name = String(row?.name || '').trim() || [row?.first_name, row?.middle_name, row?.last_name]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  const phone = normalizePhone(row?.phone) || normalizePhone(row?.phone2) || normalizePhone(row?.phone3);
  if (!name || !phone || !row?.id) return null;
  const activeValue = typeof row?.active === 'string' ? row.active.toLowerCase() : row?.active;
  const active = ![0, '0', false, 'false', 'inactive'].includes(activeValue);
  const category = String(row?.account_category_name || row?.category_name || row?.category || 'Flowlu CRM').trim() || 'Flowlu CRM';
  return { id: 'flowlu:' + row.id, name, phone, category, status: active ? 'Active' : 'Inactive', source: 'flowlu' };
}

export async function fetchFlowluContacts(): Promise<FlowluContact[]> {
  const contacts: FlowluContact[] = [];
  const pageSize = 200;
  for (let page = 1; page <= 50; page += 1) {
    const data = await flowluGet('crm/account/list', { page, limit: pageSize, count: pageSize });
    const items = Array.isArray(data?.response?.items) ? data.response.items : [];
    contacts.push(...items.map(mapFlowluContact).filter((item: FlowluContact | null): item is FlowluContact => Boolean(item)));
    const total = Number(data?.response?.total || 0);
    if (!items.length || items.length < pageSize || (total > 0 && page * pageSize >= total)) break;
  }
  return contacts;
}
