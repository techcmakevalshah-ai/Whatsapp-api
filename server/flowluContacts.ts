export type FlowluContact = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: 'Active' | 'Inactive';
  source: 'flowlu';
};

type FlowluCategory = {
  id: number;
  name: string;
  active: boolean;
};

function normalizePhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
  return digits.length === 10 && defaultCountryCode ? defaultCountryCode + digits : digits;
}

function splitName(value: unknown) {
  const parts = String(value || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const firstName = parts.shift() || '';
  return { firstName, lastName: parts.join(' ') };
}

function flowluConfig() {
  let accountCode = String(process.env.FLOWLU_ACCOUNT_CODE || '').trim();
  const apiKey = String(process.env.FLOWLU_API_KEY || '').trim();
  accountCode = accountCode.replace(/^https?:\/\//i, '').replace(/\.flowlu\.com.*$/i, '').replace(/\/+$/, '').trim();
  if (!accountCode) throw new Error('FLOWLU_ACCOUNT_CODE is not configured for this app.');
  if (!apiKey) throw new Error('FLOWLU_API_KEY is not configured for this app.');
  return { apiKey, baseUrl: 'https://' + accountCode + '.flowlu.com/api/v1/module' };
}

function flowluError(data: any, status: number) {
  return String(
    data?.description ||
    data?.error?.error_msg ||
    data?.error?.message ||
    (typeof data?.error === 'string' ? data.error : '') ||
    'Flowlu request failed (' + status + ').'
  );
}

async function parseFlowluResponse(response: Response) {
  const raw = await response.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Flowlu returned an invalid response (' + response.status + ').');
  }
  if (!response.ok || data?.error) throw new Error(flowluError(data, response.status));
  return data;
}

async function flowluGet(path: string, query: Record<string, string | number> = {}) {
  const { apiKey, baseUrl } = flowluConfig();
  const url = new URL(baseUrl + '/' + String(path).replace(/^\/+/, ''));
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  return parseFlowluResponse(await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } }));
}

async function flowluPost(path: string, body: Record<string, string | number | undefined>) {
  const { apiKey, baseUrl } = flowluConfig();
  const url = new URL(baseUrl + '/' + String(path).replace(/^\/+/, ''));
  url.searchParams.set('api_key', apiKey);

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== '') form.set(key, String(value));
  }

  return parseFlowluResponse(await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  }));
}

async function fetchFlowluCategories(): Promise<FlowluCategory[]> {
  const data = await flowluGet('crm/account_category/list', { page: 1, limit: 500 });
  const items = Array.isArray(data?.response?.items) ? data.response.items : [];
  return items
    .map((row: any) => ({
      id: Number(row?.id || 0),
      name: String(row?.name || '').trim(),
      active: ![0, '0', false, 'false'].includes(row?.active),
    }))
    .filter((row: FlowluCategory) => row.id > 0 && Boolean(row.name));
}

function mapFlowluContact(row: any, categories: Map<number, string>): FlowluContact | null {
  const type = Number(row?.type ?? row?.type_id ?? 0);
  if (type && type !== 2) return null;

  const name = String(row?.name || '').trim() || [row?.first_name, row?.middle_name, row?.last_name]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  const phone = normalizePhone(row?.phone) || normalizePhone(row?.phone2) || normalizePhone(row?.phone3);
  if (!name || !phone || !row?.id) return null;

  const activeValue = typeof row?.active === 'string' ? row.active.toLowerCase() : row?.active;
  const active = ![0, '0', false, 'false', 'inactive'].includes(activeValue);
  const categoryId = Number(row?.account_category_id || 0);
  const category =
    categories.get(categoryId) ||
    String(row?.account_category_name || row?.category_name || row?.category || 'Flowlu CRM').trim() ||
    'Flowlu CRM';

  return {
    id: 'flowlu:' + row.id,
    name,
    phone,
    category,
    status: active ? 'Active' : 'Inactive',
    source: 'flowlu',
  };
}

export async function createFlowluContact(input: {
  name: string;
  phone: string;
  category?: string;
  status?: 'Active' | 'Inactive';
}): Promise<FlowluContact> {
  const { firstName, lastName } = splitName(input.name);
  const phone = normalizePhone(input.phone);

  if (!firstName) throw new Error('Contact name is required.');
  if (phone.length < 10) throw new Error('Enter a valid mobile number.');

  const categoryName = String(input.category || '').trim();
  let categoryId: number | undefined;

  if (categoryName) {
    const categories = await fetchFlowluCategories();
    const category = categories.find(
      (item) => item.active && item.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (!category) {
      throw new Error(
        'Flowlu category "' + categoryName + '" was not found. Create that segment in Flowlu first or leave Category blank.',
      );
    }
    categoryId = category.id;
  }

  const data = await flowluPost('crm/account/create', {
    type: 2,
    first_name: firstName,
    last_name: lastName || undefined,
    phone,
    active: input.status === 'Inactive' ? 0 : 1,
    account_category_id: categoryId,
    description: 'Added from Jai Dholera Team Portal',
  });

  const id = Number(data?.response?.id || 0);
  if (!id) throw new Error('Flowlu contact could not be created.');

  return {
    id: 'flowlu:' + id,
    name: [firstName, lastName].filter(Boolean).join(' '),
    phone,
    category: categoryName || 'Flowlu CRM',
    status: input.status === 'Inactive' ? 'Inactive' : 'Active',
    source: 'flowlu',
  };
}

export async function fetchFlowluContacts(): Promise<FlowluContact[]> {
  const contacts: FlowluContact[] = [];
  const pageSize = 200;
  const categories = new Map(
    (await fetchFlowluCategories()).map((category) => [category.id, category.name] as const),
  );

  for (let page = 1; page <= 50; page += 1) {
    const data = await flowluGet('crm/account/list', { page, limit: pageSize, count: pageSize });
    const items = Array.isArray(data?.response?.items) ? data.response.items : [];
    contacts.push(
      ...items
        .map((row: any) => mapFlowluContact(row, categories))
        .filter((item: FlowluContact | null): item is FlowluContact => Boolean(item)),
    );
    const total = Number(data?.response?.total || 0);
    if (!items.length || items.length < pageSize || (total > 0 && page * pageSize >= total)) break;
  }

  return contacts;
}
