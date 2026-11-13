import { cleanText, parseDay, parseMoney } from './parse';
import type { Target, Txn } from './types';

export type Cell = string | number | null;

/** Splits CSV text into rows. Works with commas, semicolons or tabs, and quoted cells. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const sample = body.slice(0, 4000);
  const count = (ch: string) => sample.split(ch).length - 1;
  const delimiter = count('\t') > count(',') && count('\t') > count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

type Role = 'date' | 'description' | 'description2' | 'amount' | 'out' | 'in' | 'balance' | 'type' | 'extra';

const HEADERS: [Role, RegExp][] = [
  ['balance', /balance|running/],
  ['out', /debit|withdraw|money out|paid out|payments?$|spent|charge|outflow/],
  ['in', /credit|deposit|money in|paid in|received|inflow/],
  ['date', /date|posted|^day$|^time$/],
  ['amount', /amount|^value$|^total$|^sum$/],
  ['type', /^type$|transaction type|dr\/?cr|debit\/credit|credit\/debit|indicator/],
  ['description', /descript|merchant|payee|^name$|memo|narrat|particular/],
  ['description2', /details?|reference|transaction$|^item$/],
  ['extra', /categor|^notes?$/],
];

function roleOf(header: string): Role | null {
  const h = header.trim().toLowerCase().replace(/[_.]+/g, ' ');
  if (!h || h.length > 40) return null;
  // "Credit/Debit" and "Transaction Type" say which way the amount goes; they aren't amounts.
  if (/^type$|transaction type|dr\/?cr|debit\/credit|credit\/debit|indicator/.test(h)) return 'type';
  for (const [role, rx] of HEADERS) if (rx.test(h)) return role;
  return null;
}

interface Columns {
  header: number;
  date: number;
  description: number[];
  amount: number;
  out: number;
  in: number;
  type: number;
}

function findColumns(rows: Cell[][], target: Target): Columns | null {
  // The header is the row, near the top, with the most column names we know.
  let best: { index: number; roles: (Role | null)[]; score: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const roles = rows[i].map((c) => (typeof c === 'string' ? roleOf(c) : null));
    const kinds = new Set(roles.filter(Boolean));
    const score = kinds.size;
    if (kinds.has('date') && (kinds.has('amount') || kinds.has('out') || kinds.has('in')) && (!best || score > best.score)) {
      best = { index: i, roles, score };
    }
  }
  if (best) {
    const first = (role: Role) => best.roles.indexOf(role);
    const all = (role: Role) => best.roles.flatMap((r, i) => (r === role ? [i] : []));
    return {
      header: best.index,
      date: first('date'),
      description: all('description').length
        ? all('description')
        : all('description2').length
          ? all('description2')
          : guessDescription(rows.slice(best.index + 1), best.roles),
      amount: first('amount'),
      out: first('out'),
      in: first('in'),
      type: first('type'),
    };
  }
  // No header: work the columns out from what's in them.
  const width = Math.max(0, ...rows.map((r) => r.length));
  const stats = Array.from({ length: width }, () => ({ dates: 0, money: 0, text: 0, length: 0 }));
  for (const row of rows.slice(0, 200)) {
    row.forEach((c, i) => {
      if (c == null || c === '') return;
      if (typeof c === 'string' && parseDay(c, target)) stats[i].dates++;
      else if (parseMoney(c, true)) stats[i].money++;
      else {
        stats[i].text++;
        stats[i].length += String(c).length;
      }
    });
  }
  const pick = (score: (s: (typeof stats)[number]) => number) => {
    let at = -1;
    let top = 0;
    stats.forEach((s, i) => {
      if (score(s) > top) {
        top = score(s);
        at = i;
      }
    });
    return at;
  };
  const date = pick((s) => s.dates);
  const amount = pick((s) => s.money);
  const description = pick((s) => s.length);
  if (date < 0 || amount < 0) return null;
  return { header: -1, date, description: description < 0 ? [] : [description], amount, out: -1, in: -1, type: -1 };
}

/** With no description heading, the column with the longest text. */
function guessDescription(rows: Cell[][], roles: (Role | null)[]): number[] {
  let at = -1;
  let top = 0;
  roles.forEach((role, i) => {
    if (role) return;
    const length = rows.slice(0, 100).reduce<number>((sum, r) => sum + (typeof r[i] === 'string' ? (r[i] as string).length : 0), 0);
    if (length > top) {
      top = length;
      at = i;
    }
  });
  return at < 0 ? [] : [at];
}

/**
 * Finds the transactions in a spreadsheet or CSV export, whatever the bank
 * called its columns. Returns none when it can't find a date and an amount.
 */
export function readTable(rows: Cell[][], target: Target): Txn[] {
  const cols = findColumns(rows, target);
  if (!cols) return [];
  const body = rows.slice(cols.header + 1);
  // 13/11 can only be day first; if no date says so, month comes first.
  const dayFirst = body.some((r) => {
    const m = typeof r[cols.date] === 'string' ? (r[cols.date] as string).match(/^\s*(\d{1,2})[-/.](\d{1,2})/) : null;
    return !!m && Number(m[1]) > 12 && Number(m[2]) <= 12;
  });
  interface Raw {
    txn: Txn;
    negative: boolean;
    way: 'in' | 'out' | null;
  }
  const raws: Raw[] = [];
  for (const row of body) {
    const date = parseDay(row[cols.date], target, dayFirst);
    if (!date) continue;
    const description = cleanText(cols.description.map((i) => row[i] ?? '').join(' '));
    let way: Raw['way'] = null;
    let money = cols.amount >= 0 ? parseMoney(row[cols.amount], true) : null;
    if (!money || money.cents === 0) {
      const out = cols.out >= 0 ? parseMoney(row[cols.out], true) : null;
      const inn = cols.in >= 0 ? parseMoney(row[cols.in], true) : null;
      if (out && out.cents) {
        money = out;
        way = 'out';
      } else if (inn && inn.cents) {
        money = inn;
        way = 'in';
      }
    }
    if (!money || money.cents === 0) continue;
    if (!way && cols.type >= 0) {
      const t = String(row[cols.type] ?? '').toLowerCase();
      if (/credit|deposit|payment|refund|return|reversal|^cr$|income/.test(t)) way = 'in';
      else if (/debit|sale|purchase|withdraw|^dr$|fee|charge/.test(t)) way = 'out';
    }
    if (money.credit) way = 'in';
    raws.push({ txn: { date, description, amount: money.cents }, negative: money.negative, way });
  }
  // One signed amount column: banks write spending as negative, some cards as
  // positive. Spending is whichever sign there's more of.
  const unsure = raws.filter((r) => !r.way);
  const negatives = unsure.filter((r) => r.negative).length;
  const negativeIsOut = negatives === 0 ? false : negatives >= unsure.length - negatives;
  return raws.map((r) => {
    const out = r.way ? r.way === 'out' : r.negative === negativeIsOut;
    return { ...r.txn, amount: out ? r.txn.amount : -r.txn.amount };
  });
}
