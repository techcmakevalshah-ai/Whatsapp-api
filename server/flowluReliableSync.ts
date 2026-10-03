import {
  fetchFlowluCategories,
  flowluGet,
  mapFlowluContact,
  type FlowluContact,
} from './flowluContacts.js';

export async function fetchAllFlowluContactsReliable(): Promise<FlowluContact[]> {
  const pageSize = 200;
  const contacts = new Map<number, FlowluContact>();
  const categories = new Map(
    (await fetchFlowluCategories()).map((category) => [category.id, category.name] as const),
  );

  let rawRowsSeen = 0;
  let previousPageSignature = '';

  for (let page = 1; page <= 100; page += 1) {
    const data = await flowluGet('crm/account/list', {
      page,
      limit: pageSize,
    });

    const response = data?.response || {};
    const items = Array.isArray(response?.items) ? response.items : [];
    if (!items.length) break;

    const signature = [
      String(items[0]?.id || ''),
      String(items[items.length - 1]?.id || ''),
      String(items.length),
    ].join(':');

    if (signature && signature === previousPageSignature) break;
    previousPageSignature = signature;
    rawRowsSeen += items.length;

    for (const row of items) {
      const contact = mapFlowluContact(row, categories);
      if (contact) contacts.set(contact.flowluId, contact);
    }

    const total = Number(response?.total || 0);
    if (total > 0 && rawRowsSeen >= total) break;
  }

  return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
}
