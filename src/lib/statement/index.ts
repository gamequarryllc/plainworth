import { strFromU8 } from 'fflate';

import { chunkLines, readAiAnswer, AI_INSTRUCTIONS } from './ai';
import { readLines, toLines } from './lines';
import { parseCsv, readTable } from './table';
import type { Fragment, Target, Txn } from './types';
import { looksLikeZip, readXlsx } from './xlsx-read';

export * from './review';
export type { Fragment, Target, Txn } from './types';

/** A spreadsheet export: Excel (.xlsx) or CSV, told apart by its first bytes. */
export function readSpreadsheet(bytes: Uint8Array, target: Target): Txn[] {
  if (looksLikeZip(bytes)) return readTable(readXlsx(bytes), target);
  return readTable(parseCsv(decodeText(bytes)), target);
}

/** Text from bytes: UTF-8, UTF-16 (some banks export it) or, failing those, Latin-1. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    return out;
  }
  const utf8 = strFromU8(bytes);
  return utf8.includes('\uFFFD') ? strFromU8(bytes, true) : utf8;
}

/** The text of a PDF, by the rules alone. */
export function readText(fragments: Fragment[], target: Target): Txn[] {
  return readLines(toLines(fragments), target);
}

/**
 * The same text, read with the phone's own model. `ask` sends one piece to the
 * model and returns its answer. Falls back to the rules when they find more.
 */
export async function readTextWithAi(
  fragments: Fragment[],
  target: Target,
  ask: (instructions: string, prompt: string) => Promise<string>,
  onProgress?: (done: number, of: number) => void,
): Promise<{ txns: Txn[]; usedAi: boolean }> {
  const lines = toLines(fragments);
  const byRules = readLines(lines, target);
  const chunks = chunkLines(lines);
  const byAi: Txn[] = [];
  try {
    for (let i = 0; i < chunks.length; i++) {
      onProgress?.(i, chunks.length);
      byAi.push(...readAiAnswer(await ask(AI_INSTRUCTIONS, chunks[i]), chunks[i], target));
    }
  } catch {
    return { txns: byRules, usedAi: false };
  }
  return byAi.length > byRules.length ? { txns: byAi, usedAi: true } : { txns: byRules, usedAi: false };
}
