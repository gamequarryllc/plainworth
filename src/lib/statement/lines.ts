import { cleanText, DATE_AT_START, MONEY, parseDay, parseMoney } from './parse';
import type { Fragment, Target, Txn } from './types';

/**
 * Puts pieces of text back into the lines they were printed on. A PDF (or a
 * scanned page) often gives the date, the description and the amount of one line as
 * three separate pieces; pieces at the same height belong together.
 */
export function toLines(fragments: Fragment[]): string[] {
  const sorted = fragments
    .filter((f) => f.text.trim())
    .sort((a, b) => a.page - b.page || a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: Fragment[][] = [];
  let row: Fragment[] = [];
  let center = 0;
  let height = 0;
  let page = -1;
  for (const f of sorted) {
    const c = f.y + f.h / 2;
    if (row.length && f.page === page && Math.abs(c - center) <= Math.min(f.h, height) * 0.6) {
      row.push(f);
      continue;
    }
    if (row.length) rows.push(row);
    row = [f];
    center = c;
    height = f.h;
    page = f.page;
  }
  if (row.length) rows.push(row);
  return rows.map((r) =>
    r
      .sort((a, b) => a.x - b.x)
      .map((f) => f.text.trim())
      .join('   '),
  );
}

const MONEY_RX = new RegExp(MONEY, 'gi');
/** Lines that carry an amount but aren't a transaction. */
const NOT_A_TXN =
  /\b(balance|total|subtotal|minimum|payment due|amount due|credit limit|credit line|available|statement|page \d|apr\b|annual percentage|points|rewards|year[- ]to[- ]date|ytd|summary|past due|cash advance limit|interest rate|account number|ending in)\b/i;
const IN_HEADING = /\b(deposits?|credits?|additions?|payments? and (other )?credits|money in|paid in|income)\b/i;
const OUT_HEADING =
  /\b(withdrawals?|debits?|purchases?|checks? paid|fees?|charges?|subtractions?|money out|paid out|card transactions|transactions|atm)\b/i;
const IN_WORDS =
  /\b(deposit|payroll|direct dep|dir dep|salary|refund|reversal|interest paid|interest earned|dividend|cashback|cash back|credit|payment received|payment[ -]+thank you|from savings|zelle from|venmo cashout)\b/i;

interface Found {
  date: string | null;
  description: string;
  cents: number;
  negative: boolean;
  credit: boolean;
  plus: boolean;
  section: 'in' | 'out' | null;
}

/** Fixes the slips a text reader makes inside amounts: "$ 12.50", "1 ,234.56", "12. 50". */
function tidyLine(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/([$€£])\s+(?=\d)/g, '$1')
    .replace(/(\d)\s?,\s?(\d{3})(?!\d)/g, '$1,$2')
    .replace(/(\d)\s?\.\s(\d{2})(?!\d)/g, '$1.$2');
}

/**
 * Finds the transactions in the lines of a statement: a date, a description
 * and an amount. Handles a second posting date, a running balance after the
 * amount, dates printed once above a group of lines (as banking apps do), and
 * dates printed under the line they belong to.
 */
export function readLines(input: string[], target: Target): Txn[] {
  const lines = input.map(tidyLine);
  const text = lines.join('\n');
  const card = /credit card|minimum payment|payment due date|credit limit|new balance|purchases and adjustments|cardmember|card member/i.test(text);
  // Day first only when some date can't be read any other way.
  const dayFirst = lines.some((l) => {
    const m = l.match(/^\s*(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?\s/);
    return !!m && Number(m[1]) > 12 && Number(m[2]) <= 12;
  });

  const found: Found[] = [];
  let section: Found['section'] = null;
  let dateAbove: string | null = null;
  let waitingForDate: Found | null = null;

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    const dateMatch = line.match(DATE_AT_START);
    const date = dateMatch ? parseDay(dateMatch[0], target, dayFirst) : null;
    if (date) {
      line = line.slice(dateMatch![0].length).replace(/^[\s,;|·•*-]+/, '');
      // A second date (the day it posted) comes right after on many statements.
      const second = line.match(DATE_AT_START);
      if (second && parseDay(second[0], target, dayFirst)) line = line.slice(second[0].length).replace(/^[\s,;|·•*-]+/, '');
    }
    const amounts = [...line.matchAll(MONEY_RX)];
    if (!amounts.length) {
      if (date && !line) {
        // A date on its own: a heading for what follows, or the day of the line above.
        if (waitingForDate) waitingForDate.date = date;
        else dateAbove = date;
      } else if (date && waitingForDate) {
        waitingForDate.date = date;
      } else if (!date && line.length < 60) {
        if (IN_HEADING.test(line) && !OUT_HEADING.test(line.replace(IN_HEADING, ''))) section = 'in';
        else if (OUT_HEADING.test(line)) section = 'out';
      }
      waitingForDate = null;
      continue;
    }
    waitingForDate = null;
    // Amounts count only from the end of the line: "amount" or "amount balance".
    const tail = trailing(line, amounts);
    if (!tail.length) continue;
    const description = cleanText(line.slice(0, tail[0].index).replace(/[\s.·•|:-]+$/, ''));
    if (NOT_A_TXN.test(description) || (!date && NOT_A_TXN.test(line))) continue;
    if (!description || !/[a-z]{2}/i.test(description)) continue;
    const money = parseMoney(tail[0][0]);
    if (!money || money.cents === 0) continue;
    const item: Found = { date: date ?? dateAbove, description, ...money, section };
    if (!date && !dateAbove) waitingForDate = item;
    found.push(item);
  }

  // A statement that dates its lines: anything without a date was a stray total.
  const dated = found.filter((f) => f.date);
  const kept = dated.length >= 3 ? dated : found;
  const anyNegative = kept.some((f) => f.negative);
  return kept.map((f) => {
    let out: boolean;
    if (f.credit) out = false;
    else if (card) out = !f.negative;
    else if (f.negative) out = true;
    else if (f.plus) out = false;
    else if (f.section) out = f.section === 'out';
    else if (anyNegative) out = false;
    else out = !IN_WORDS.test(f.description);
    return { date: f.date, description: f.description, amount: out ? f.cents : -f.cents };
  });
}

/** The run of amounts that ends the line (at most three: money out, money in, balance). */
function trailing(line: string, amounts: RegExpMatchArray[]): RegExpMatchArray[] {
  const run: RegExpMatchArray[] = [];
  let end = line.trimEnd().length;
  for (let i = amounts.length - 1; i >= 0 && run.length < 3; i--) {
    const m = amounts[i];
    const stop = m.index! + m[0].length;
    if (line.slice(stop, end).trim() !== '') break;
    run.unshift(m);
    end = m.index!;
  }
  return run;
}
