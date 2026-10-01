export type FlowluContact = {
  id: string;
  flowluId: number;
  name: string;
  phone: string;
  category: string;
  categoryId?: number | null;
  status: 'Active' | 'Inactive';
  source: 'flowlu';
  email?: string | null;
  description?: string | null;
  address?: string | null;
  ownerId?: number | null;
  sourceUpdatedAt?: string | null;
};

export type FlowluCategory = {
  id: number;
  name: string;
  active: boolean;
};

const FLOWLU_REQUEST_GAP_MS = 650;
const FLOWLU_MAX_ATTEMPTS = 4;
const FLOWLU_CATEGORY_CACHE_MS = 10 * 60 * 1000;
const FLOWLU_CONTACT_CACHE_MS = 20 * 1000;

let flowluRequestTail: Promise<void> = Promise.resolve();
let lastFlowluRequestAt = 0;
let categoryCache: { expiresAt: number; value: FlowluCategory[] } | null = null;
let contactCache: { expiresAt: number; value: FlowluContact[] } | null = null;
let contactsInFlight: Promise<FlowluContact[]> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFlowluRequestSlot<T>(operation: () => Promise<T>): Promise<T> {
  const previous = flowluRequestTail;
  let release: () => void = () => {};
  flowluRequestTail = new Promise<void>((resolve) => { release = resolve; });

  await previous.catch(() => undefined);

  const waitMs = Math.max(0, lastFlowluRequestAt + FLOWLU_REQUEST_GAP_MS - Date.now());
  if (waitMs > 0) await sleep(waitMs);

  try {
    return await operation();
  } finally {
    lastFlowluRequestAt = Date.now();
    release();
  }
}

export function normalizeFlowluPhone(value: unknown) {
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

async function flowluRequest(url: URL, init: RequestInit) {
  for (let attempt = 1; attempt <= FLOWLU_MAX_ATTEMPTS; attempt += 1) {
    const response = await withFlowluRequestSlot(() => fetch(url, init));
    const raw = await response.text();

    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Flowlu returned an invalid response (' + response.status + ').');
    }

    const message = flowluError(data, response.status);
    const rateLimited =
      response.status === 429 ||
      /request limit|rate limit|too many requests|throttl/i.test(message);

    if (rateLimited && attempt < FLOWLU_MAX_ATTEMPTS) {
      const retryAfterHeader = Number(response.headers.get('retry-after') || 0);
      const retryAfterMs = retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : Math.min(8000, 1000 * Math.pow(2, attempt - 1));
      await sleep(retryAfterMs);
      continue;
    }

    if (!response.ok || data?.error) {
      if (rateLimited) {
        throw new Error('Flowlu request limit reached. Please wait a few seconds and refresh again.');
      }
      throw new Error(message);
    }

    return data;
  }

  throw new Error('Flowlu request limit reached. Please wait a few seconds and refresh again.');
}

export async function flowluGet(path: string, query: Record<string, string | number> = {}) {
  const { apiKey, baseUrl } = flowluConfig();
  const url = new URL(baseUrl + '/' + String(path).replace(/^\/+/, ''));
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  return flowluRequest(url, { method: 'GET', headers: { Accept: 'application/json' } });
}

export async function flowluPost(path: string, body: Record<string, string | number | undefined>) {
  const { apiKey, baseUrl } = flowluConfig();
  const url = new URL(baseUrl + '/' + String(path).replace(/^\/+/, ''));
  url.searchParams.set('api_key', apiKey);

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== '') form.set(key, String(value));
  }

  return flowluRequest(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
}

export async function fetchFlowluCategories(force = false): Promise<FlowluCategory[]> {
  if (!force && categoryCache && categoryCache.expiresAt > Date.now()) return categoryCache.value;

  const data = await flowluGet('crm/account_category/list', { page: 1, limit: 200 });
  const items = Array.isArray(data?.response?.items) ? data.response.items : [];
  const categories = items
    .map((row: any) => ({
      id: Number(row?.id || 0),
      name: String(row?.name || '').trim(),
      active: ![0, '0', false, 'false'].includes(row?.active),
    }))
    .filter((row: FlowluCategory) => row.id > 0 && Boolean(row.name));

  categoryCache = { expiresAt: Date.now() + FLOWLU_CATEGORY_CACHE_MS, value: categories };
  return categories;
}

function contactName(row: any) {
  return String(row?.name || '').trim() || [row?.first_name, row?.middle_name, row?.last_name]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

export function mapFlowluContact(row: any, categories: Map<number, string> = new Map()): FlowluContact | null {
  const type = Number(row?.type ?? row?.type_id ?? 0);
  if (type && type !== 2) return null;

  const flowluId = Number(row?.id || 0);
  const name = contactName(row);
  const phone = normalizeFlowluPhone(row?.phone) || normalizeFlowluPhone(row?.phone2) || normalizeFlowluPhone(row?.phone3);
  if (!name || !phone || !flowluId) return null;

  const activeValue = typeof row?.active === 'string' ? row.active.toLowerCase() : row?.active;
  const active = ![0, '0', false, 'false', 'inactive'].includes(activeValue);
  const categoryId = Number(row?.account_category_id || 0) || null;
  const category =
    (categoryId ? categories.get(categoryId) : '') ||
    String(row?.account_category_name || row?.category_name || row?.category || 'Flowlu CRM').trim() ||
    'Flowlu CRM';

  return {
    id: 'flowlu:' + flowluId,
    flowluId,
    name,
    phone,
    category,
    categoryId,
    status: active ? 'Active' : 'Inactive',
    source: 'flowlu',
    email: String(row?.email || row?.email_personal || '').trim() || null,
    description: String(row?.description || '').trim() || null,
    address: String(row?.address || '').trim() || null,
    ownerId: Number(row?.owner_id || 0) || null,
    sourceUpdatedAt: String(row?.updated_date || row?.created_date || '').trim() || null,
  };
}

export function invalidateFlowluMemoryCache() {
  contactCache = null;
}

export async function fetchFlowluContactById(id: number): Promise<FlowluContact | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const [data, categories] = await Promise.all([
    flowluGet('crm/account/get/' + id),
    fetchFlowluCategories(),
  ]);
  return mapFlowluContact(data?.response, new Map(categories.map((item) => [item.id, item.name])));
}

export async function findFlowluContactByPhone(value: unknown): Promise<FlowluContact | null> {
  const phone = normalizeFlowluPhone(value);
  if (!phone) return null;

  const [data, categories] = await Promise.all([
    flowluGet('crm/account/list', { search: phone, page: 1, limit: 50, 'filter[type_id]': 2 }),
    fetchFlowluCategories(),
  ]);
  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const items = Array.isArray(data?.response?.items) ? data.response.items : [];

  for (const row of items) {
    const contact = mapFlowluContact(row, categoryMap);
    if (contact && contact.phone === phone) return contact;
  }
  return null;
}

export async function createFlowluContact(input: {
  name: string;
  phone: string;
  category?: string;
  status?: 'Active' | 'Inactive';
}): Promise<FlowluContact> {
  const { firstName, lastName } = splitName(input.name);
  const phone = normalizeFlowluPhone(input.phone);

  if (!firstName) throw new Error('Contact name is required.');
  if (phone.length < 10) throw new Error('Enter a valid mobile number.');

  const duplicate = await findFlowluContactByPhone(phone);
  if (duplicate) {
    throw new Error('A Flowlu contact already exists with this mobile number: ' + duplicate.name + ' (+' + duplicate.phone + ').');
  }

  const categoryName = String(input.category || '').trim();
  let categoryId: number | undefined;

  if (categoryName) {
    let categories = await fetchFlowluCategories();
    let category = categories.find(
      (item) => item.active && item.name.toLowerCase() === categoryName.toLowerCase(),
    );

    if (!category) {
      categories = await fetchFlowluCategories(true);
      category = categories.find(
        (item) => item.active && item.name.toLowerCase() === categoryName.toLowerCase(),
      );
    }

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

  invalidateFlowluMemoryCache();
  const created = await fetchFlowluContactById(id);
  if (created) return created;

  return {
    id: 'flowlu:' + id,
    flowluId: id,
    name: [firstName, lastName].filter(Boolean).join(' '),
    phone,
    category: categoryName || 'Flowlu CRM',
    categoryId: categoryId || null,
    status: input.status === 'Inactive' ? 'Inactive' : 'Active',
    source: 'flowlu',
  };
}

async function loadFlowluContacts(): Promise<FlowluContact[]> {
  const contacts: FlowluContact[] = [];
  const pageSize = 200;
  const categories = new Map(
    (await fetchFlowluCategories()).map((category) => [category.id, category.name] as const),
  );

  for (let page = 1; page <= 50; page += 1) {
    const data = await flowluGet('crm/account/list', {
      page,
      limit: pageSize,
      'filter[type_id]': 2,
    });
    const items = Array.isArray(data?.response?.items) ? data.response.items : [];

    contacts.push(
      ...items
        .map((row: any) => mapFlowluContact(row, categories))
        .filter((item: FlowluContact | null): item is FlowluContact => Boolean(item)),
    );

    const total = Number(data?.response?.total || 0);
    if (!items.length || items.length < pageSize || (total > 0 && page * pageSize >= total)) break;
  }

  contactCache = { expiresAt: Date.now() + FLOWLU_CONTACT_CACHE_MS, value: contacts };
  return contacts;
}

export async function fetchFlowluContacts(force = false): Promise<FlowluContact[]> {
  if (force) contactCache = null;
  if (contactCache && contactCache.expiresAt > Date.now()) return contactCache.value;
  if (contactsInFlight) return contactsInFlight;

  contactsInFlight = loadFlowluContacts();
  try {
    return await contactsInFlight;
  } finally {
    contactsInFlight = null;
  }
}
