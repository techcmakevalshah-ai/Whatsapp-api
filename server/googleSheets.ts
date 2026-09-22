import { google } from 'googleapis';
import crypto from 'node:crypto';

export type SheetContact = {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: 'Active' | 'Inactive';
};

const HEADER_ALIASES = {
  name: ['name', 'full name', 'contact name'],
  phone: ['mobile', 'mobile no', 'mobile number', 'phone', 'phone no', 'phone number', 'whatsapp', 'whatsapp number'],
  category: ['category', 'type', 'segment', 'group'],
  status: ['status', 'active', 'contact status'],
} as const;

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
  return digits.length === 10 && defaultCountryCode ? `${defaultCountryCode}${digits}` : digits;
}

function columnIndex(headers: string[], aliases: readonly string[], fallback: number) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const found = headers.findIndex((header) => wanted.has(header));
  return found >= 0 ? found : fallback;
}

function stableContactId(name: string, phone: string) {
  return crypto.createHash('sha256').update(`${phone}:${name.toLowerCase()}`).digest('hex').slice(0, 24);
}

function config() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1snnfuibfwKlTREsanssDV6yzxGsWzPUzg3X5Qk8kVaE';
  const range = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:Z';
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!spreadsheetId || !email || !privateKey) {
    throw new Error('Google Sheet environment variables are missing.');
  }

  return { spreadsheetId, range, email, privateKey };
}

function client() {
  const { email, privateKey } = config();
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function readRows() {
  const { spreadsheetId, range } = config();
  const sheets = client();
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = result.data.values || [];

  if (!rows.length) {
    return {
      rows: [] as any[][],
      headers: [] as string[],
      looksLikeHeader: false,
      nameIndex: 0,
      phoneIndex: 1,
      categoryIndex: 2,
      statusIndex: 4,
    };
  }

  const normalizedFirstRow = rows[0].map(normalizeHeader);
  const looksLikeHeader = normalizedFirstRow.some((header) =>
    Object.values(HEADER_ALIASES).flat().map(normalizeHeader).includes(header),
  );

  const headers = looksLikeHeader ? normalizedFirstRow : [];
  return {
    rows,
    headers,
    looksLikeHeader,
    nameIndex: columnIndex(headers, HEADER_ALIASES.name, 0),
    phoneIndex: columnIndex(headers, HEADER_ALIASES.phone, 1),
    categoryIndex: columnIndex(headers, HEADER_ALIASES.category, 2),
    statusIndex: columnIndex(headers, HEADER_ALIASES.status, 4),
  };
}

function rowToContact(
  row: any[],
  indexes: { nameIndex: number; phoneIndex: number; categoryIndex: number; statusIndex: number },
): SheetContact | null {
  const name = String(row?.[indexes.nameIndex] ?? '').trim();
  const phone = normalizePhone(row?.[indexes.phoneIndex]);
  const category = String(row?.[indexes.categoryIndex] ?? 'Contact').trim() || 'Contact';
  const statusValue = normalizeHeader(row?.[indexes.statusIndex] || 'active');
  const status: 'Active' | 'Inactive' = ['inactive', 'no', 'disabled', 'blocked'].includes(statusValue)
    ? 'Inactive'
    : 'Active';

  if (!name || !phone) return null;
  return { id: stableContactId(name, phone), name, phone, category, status };
}

export async function fetchSheetContacts(): Promise<SheetContact[]> {
  const data = await readRows();
  const dataRows = data.looksLikeHeader ? data.rows.slice(1) : data.rows;

  return dataRows
    .map((row) => rowToContact(row, data))
    .filter((contact): contact is SheetContact => Boolean(contact));
}

export async function addSheetContact(input: {
  name: string;
  phone: string;
  category?: string;
  status?: 'Active' | 'Inactive';
}) {
  const name = String(input.name || '').trim();
  const phone = normalizePhone(input.phone);
  const category = String(input.category || 'Contact').trim() || 'Contact';
  const status = input.status === 'Inactive' ? 'Inactive' : 'Active';

  if (!name) throw new Error('Contact name is required.');
  if (phone.length < 10 || phone.length > 15) throw new Error('Enter a valid mobile number.');

  const existing = await fetchSheetContacts();
  if (existing.some((contact) => contact.phone === phone)) {
    throw new Error('A contact with this mobile number already exists.');
  }

  const { spreadsheetId, range } = config();
  const sheetName = range.split('!')[0] || 'Sheet1';
  const sheets = client();

  // Keep compatibility with the current sheet columns:
  // name | mobile no | category | WhatsApp Opt-In | status
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[name, phone, category, '', status]],
    },
  });

  return { id: stableContactId(name, phone), name, phone, category, status } satisfies SheetContact;
}

function columnLetter(index: number) {
  let value = index + 1;
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

export async function setSheetContactStatus(
  contactId: string,
  status: 'Active' | 'Inactive',
) {
  const data = await readRows();
  const offset = data.looksLikeHeader ? 1 : 0;
  const dataRows = data.looksLikeHeader ? data.rows.slice(1) : data.rows;

  let rowIndex = -1;
  let contact: SheetContact | null = null;

  for (let index = 0; index < dataRows.length; index += 1) {
    const parsed = rowToContact(dataRows[index], data);
    if (parsed?.id === contactId) {
      rowIndex = index + offset;
      contact = parsed;
      break;
    }
  }

  if (rowIndex < 0 || !contact) {
    throw new Error('Contact no longer exists in the Google Sheet.');
  }

  const { spreadsheetId, range } = config();
  const sheetName = range.split('!')[0] || 'Sheet1';
  const sheets = client();
  const rowNumber = rowIndex + 1;
  const statusCell = `${sheetName}!${columnLetter(data.statusIndex)}${rowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: statusCell,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status]] },
  });

  return { ...contact, status };
}
