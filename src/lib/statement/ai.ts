import { cleanText, parseDay, parseMoney } from './parse';
import type { Target, Txn } from './types';

export const AI_INSTRUCTIONS =
  'You read text copied from a bank or credit card statement and list its transactions. ' +
  'Write one transaction per line as: date | description | amount | in or out. ' +
  'Copy the date, description and amount exactly as printed. "out" is money spent or withdrawn; "in" is money received. ' +
  'Leave out balances, totals, headings and anything that is not a transaction. Write nothing else. ' +
  'If there are no transactions, write NONE.';

/** The on-device model reads a few thousand characters at a time, so a statement goes to it in pieces. */
export function chunkLines(lines: string[], size = 1400): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const next = line.slice(0, 300);
    if (current && current.length + next.length + 1 > size) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + next;
  }
  if (current) chunks.push(current);
  return chunks;
}

const digits = (s: string) => s.replace(/\D/g, '');

/**
 * Reads the model's answer. A line is kept only if its amount really appears
 * in the text it was given, so the model can tidy a messy statement but can't
 * make a transaction up.
 */
export function readAiAnswer(answer: string, source: string, target: Target): Txn[] {
  const sourceDigits = digits(source);
  const out: Txn[] = [];
  for (const line of answer.split('\n')) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) continue;
    const money = parseMoney(parts[2]) ?? parseMoney(parts[2], true);
    const description = cleanText(parts[1]);
    if (!money || money.cents === 0 || !description) continue;
    const shown = digits(parts[2]);
    if (shown.length < 3 || !sourceDigits.includes(shown)) continue;
    const way = (parts[3] ?? '').toLowerCase();
    const out_ = way.startsWith('in') ? false : way.startsWith('out') ? true : !money.negative;
    out.push({ date: parseDay(parts[0], target), description, amount: out_ ? money.cents : -money.cents });
  }
  return out;
}
