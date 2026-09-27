import { randomUUID } from 'crypto';
import { findAmount } from '@/lib/core/receipts';
import { planImport } from '@/lib/core/ingest';
import type { ImportRecord } from '@/lib/core/types';
import { HttpError } from '../http';
import { withVault } from '../repo';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
// Bill-like emails from the last 12 months. Only emails with an amount are kept (see keepEmail).
export const GMAIL_QUERY =
  'newer_than:365d (bill OR invoice OR receipt OR renewal OR renews OR "due date" OR "payment due" OR premium OR subscription OR statement OR "amount due" OR "₹" OR "Rs.")';
const MAX_MESSAGES = 60;

export interface BillEmail {
  from: string;
  subject: string;
  date: string; // YYYY-MM-DD
  body: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}
interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
}

const decode = (data: string) => Buffer.from(data, 'base64url').toString('utf8');

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rupee: '₹' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Turn one Gmail API message into a bill email (plain text preferred, else HTML converted to text). */
export function toBillEmail(msg: GmailMessage): BillEmail {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p?: GmailPart) => {
    if (!p) return;
    if (p.body?.data && p.mimeType === 'text/plain') plain.push(decode(p.body.data));
    else if (p.body?.data && p.mimeType === 'text/html') html.push(decode(p.body.data));
    for (const c of p.parts ?? []) walk(c);
  };
  walk(msg.payload);
  const header = (name: string) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
  const body = (plain.length ? plain.join('\n') : htmlToText(html.join('\n'))).replace(/\s+\n/g, '\n').trim();
  const date = new Date(Number(msg.internalDate) || Date.now()).toISOString().slice(0, 10);
  return { from: header('from').slice(0, 200) || 'Unknown sender', subject: header('subject').slice(0, 300), date, body: body.slice(0, 5000) };
}

/** Keep only emails that look like money: they must contain an amount. */
export const keepEmail = (e: BillEmail) => !!e.body && findAmount(`${e.subject}\n${e.body}`) !== null;

async function gmailGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new HttpError(502, `Gmail could not be read (${res.status})`);
  return (await res.json()) as T;
}

/** Search the user's Gmail (read-only) for bill-like emails. */
export async function fetchBillEmails(accessToken: string): Promise<{ scanned: number; emails: BillEmail[] }> {
  const list = await gmailGet<{ messages?: { id: string }[] }>(`${API}?${new URLSearchParams({ q: GMAIL_QUERY, maxResults: String(MAX_MESSAGES) })}`, accessToken);
  const ids = (list.messages ?? []).map((m) => m.id).slice(0, MAX_MESSAGES);
  const emails: BillEmail[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) => gmailGet<GmailMessage>(`${API}/${encodeURIComponent(id)}?format=full`, accessToken)));
    for (const m of batch) {
      const e = toBillEmail(m);
      if (keepEmail(e)) emails.push(e);
    }
  }
  return { scanned: ids.length, emails };
}

/** Import bill emails into the user's vault through the normal import path (dedupe applies: importing again adds 0). */
export function importBillEmails(userId: string, emails: BillEmail[], gmailAddress: string): Promise<ImportRecord> {
  return withVault(userId, (vault) => {
    const importId = randomUUID();
    const plan = planImport(vault, { fileName: 'gmail.json', text: JSON.stringify(emails) }, { newId: randomUUID, today: new Date().toISOString().slice(0, 10), importId });
    vault.receipts.push(...plan.receipts);
    const record: ImportRecord = {
      id: importId,
      fileName: `Gmail (${gmailAddress})`,
      kind: 'receipts',
      format: 'json',
      rowsTotal: emails.length,
      added: plan.added,
      duplicates: plan.duplicates,
      errors: plan.errors.slice(0, 20),
      createdAt: new Date().toISOString(),
    };
    vault.imports.push(record);
    return record;
  });
}
