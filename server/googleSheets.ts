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

export async function fetchSheetContacts(): Promise<SheetContact[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID || '1snnfuibfwKlTREsanssDV6yzxGsWzPUzg3X5Qk8kVaE';
  const range = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:Z';
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!sheetId || !email || !privateKey) {
    throw new Error('Google Sheet environment variables are missing.');
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const rows = result.data.values || [];
  if (!rows.length) return [];

  const normalizedFirstRow = rows[0].map(normalizeHeader);
  const looksLikeHeader = normalizedFirstRow.some((header) =>
    Object.values(HEADER_ALIASES).flat().map(normalizeHeader).includes(header),
  );

  const headers = looksLikeHeader ? normalizedFirstRow : [];
  const nameIndex = columnIndex(headers, HEADER_ALIASES.name, 0);
  const phoneIndex = columnIndex(headers, HEADER_ALIASES.phone, 1);
  const categoryIndex = columnIndex(headers, HEADER_ALIASES.category, 2);
  const statusIndex = columnIndex(headers, HEADER_ALIASES.status, 5);

  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  return dataRows
    .map((row) => {
      const name = String(row?.[nameIndex] ?? '').trim();
      const phone = normalizePhone(row?.[phoneIndex]);
      const category = String(row?.[categoryIndex] ?? 'Contact').trim() || 'Contact';
      const statusValue = normalizeHeader(row?.[statusIndex] || 'active');
      const status: 'Active' | 'Inactive' = ['inactive', 'no', 'disabled', 'blocked'].includes(statusValue)
        ? 'Inactive'
        : 'Active';
      if (!name || !phone) return null;
      return { id: stableContactId(name, phone), name, phone, category, status } satisfies SheetContact;
    })
    .filter((contact): contact is SheetContact => Boolean(contact));
}
