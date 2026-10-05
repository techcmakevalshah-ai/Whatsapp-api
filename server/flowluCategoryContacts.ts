import {
  fetchFlowluCategories,
  flowluGet,
  mapFlowluContact,
  type FlowluContact,
} from './flowluContacts.js';

export type FlowluCategoryContactResult = {
  contacts: FlowluContact[];
  total: number;
  page: number;
  count: number;
  categoryId: number;
};

const CATEGORY_CACHE_MS = 30 * 1000;
const categoryContactCache = new Map<string, { expiresAt: number; value: FlowluCategoryContactResult }>();

export async function fetchFlowluContactsByCategory(input: {
  categoryId: number;
  page?: number;
  limit?: number;
  search?: string;
  force?: boolean;
}): Promise<FlowluCategoryContactResult> {
  const categoryId = Number(input.categoryId);
  if (!Number.isFinite(categoryId) || categoryId < 0) {
    throw new Error('Choose a valid Flowlu segment.');
  }

  const page = Math.max(1, Number(input.page || 1));
  const limit = Math.min(200, Math.max(1, Number(input.limit || 200)));
  const search = String(input.search || '').trim();
  const cacheKey = [categoryId, page, limit, search.toLowerCase()].join('|');

  if (!input.force) {
    const cached = categoryContactCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const categories = await fetchFlowluCategories();
  const categoryMap = new Map(categories.map((category) => [category.id, category.name] as const));

  const query: Record<string, string | number> = {
    page,
    limit,
    'filter[type_id]': 2,
    'filter[account_category_id]': categoryId,
  };
  if (search) query.search = search;

  const data = await flowluGet('crm/account/list', query);
  const response = data?.response || {};
  const items = Array.isArray(response?.items) ? response.items : [];
  const contacts = items
    .map((row: any) => mapFlowluContact(row, categoryMap))
    .filter((item: FlowluContact | null): item is FlowluContact => Boolean(item))
    .sort((a: FlowluContact, b: FlowluContact) => a.name.localeCompare(b.name));

  const result: FlowluCategoryContactResult = {
    contacts,
    total: Number(response?.total || contacts.length),
    page: Number(response?.page || page),
    count: Number(response?.count || contacts.length),
    categoryId,
  };

  categoryContactCache.set(cacheKey, {
    expiresAt: Date.now() + CATEGORY_CACHE_MS,
    value: result,
  });

  return result;
}

export function clearFlowluCategoryContactCache(categoryId?: number) {
  if (typeof categoryId !== 'number') {
    categoryContactCache.clear();
    return;
  }

  for (const key of categoryContactCache.keys()) {
    if (key.startsWith(String(categoryId) + '|')) categoryContactCache.delete(key);
  }
}
