import { strFromU8, unzipSync } from 'fflate';

import type { Cell } from './table';

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** All the text inside an element's <t> parts (rich text has several). */
function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** "C7" → 2 (the column, from 0). */
function columnOf(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** The rows of the fullest sheet in an Excel (.xlsx) file. Dates come back as day numbers. */
export function readXlsx(bytes: Uint8Array): Cell[][] {
  const files = unzipSync(bytes, { filter: (f) => /^xl\/(sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  const shared: string[] = [];
  const sharedXml = files['xl/sharedStrings.xml'];
  if (sharedXml) {
    for (const m of strFromU8(sharedXml).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }
  let best: Cell[][] = [];
  for (const name of Object.keys(files).sort()) {
    if (!name.startsWith('xl/worksheets/')) continue;
    const rows: Cell[][] = [];
    for (const rowMatch of strFromU8(files[name]).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
      const row: Cell[] = [];
      let next = 0;
      for (const c of rowMatch[1].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? '';
        const ref = attrs.match(/\sr="([A-Z]+)\d+"/);
        const at = ref ? columnOf(ref[1]) : next;
        next = at + 1;
        const type = attrs.match(/\st="(\w+)"/)?.[1];
        const inner = c[2] ?? '';
        const v = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
        let value: Cell = null;
        if (type === 's') value = v != null ? (shared[Number(v)] ?? '') : null;
        else if (type === 'inlineStr') value = textOf(inner);
        else if (type === 'str' || type === 'e') value = v != null ? decodeXml(v) : null;
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null && v !== '') value = Number(v);
        while (row.length < at) row.push(null);
        row[at] = value;
      }
      if (row.some((x) => x != null && x !== '')) rows.push(row);
    }
    if (rows.length > best.length) best = rows;
  }
  return best;
}

/** True when the bytes start like a zip, which is what an .xlsx file is. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
