/**
 * A small Excel (.xlsx) writer: plain values, a few number formats, bold rows,
 * column widths and frozen headers. An .xlsx file is a zip of XML parts; this
 * stores them uncompressed, which every spreadsheet app reads.
 */

/** `heading` is bold and right-aligned, for the header of a column of numbers. */
export type CellStyle = 'bold' | 'heading' | 'money' | 'moneyBold' | 'date' | 'percent' | 'percentBold';

export type Cell = string | number | null | undefined | { value: string | number; style: CellStyle };

export interface Sheet {
  /** Up to 31 characters; unique within the workbook. */
  name: string;
  rows: Cell[][];
  /** Column widths, in characters. */
  widths?: number[];
  /** Rows and columns that stay in view while scrolling. */
  freeze?: { rows?: number; columns?: number };
}

const STYLE_INDEX: Record<CellStyle, number> = {
  bold: 1,
  money: 2,
  moneyBold: 3,
  date: 4,
  percent: 5,
  percentBold: 6,
  heading: 7,
};

/** The workbook's bytes. `money` is the number format for amounts, see `moneyFormat`. */
export function buildWorkbook(sheets: Sheet[], money: string): Uint8Array {
  const files: [string, string][] = [
    ['[Content_Types].xml', contentTypes(sheets.length)],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbookXml(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRels(sheets.length)],
    ['xl/styles.xml', stylesXml(money)],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files.map(([name, xml]) => ({ name, data: utf8(xml) })));
}

/** An Excel number format for amounts in a currency, e.g. "$"#,##0.00. */
export function moneyFormat(symbol: string, decimals: number): string {
  return `"${symbol.replace(/"/g, '')}"#,##0${decimals > 0 ? '.' + '0'.repeat(decimals) : ''}`;
}

/** Days since 1899-12-30, how Excel stores dates, from days since 1970-01-01. */
export function excelDate(dayNumber: number): number {
  return dayNumber + 25_569;
}

/** "A", "B", … "Z", "AA", … */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Excel's rules for sheet names: no : \ / ? * [ ], at most 31 characters, not blank. */
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const ROOT_RELS =
  XML_HEAD +
  `<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets +
    '</Types>'
  );
}

function workbookXml(sheets: Sheet[]): string {
  const list = sheets
    .map((s, i) => `<sheet name="${escape(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return XML_HEAD + `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${list}</sheets></workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return (
    XML_HEAD +
    `<Relationships xmlns="${PKG_REL_NS}">${sheets}` +
    `<Relationship Id="rId${count + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`
  );
}

function stylesXml(money: string): string {
  // Order matches STYLE_INDEX: normal, bold, money, bold money, date, percent, bold percent, heading.
  const xf = (numFmt: number, bold: boolean, right = false) =>
    `<xf numFmtId="${numFmt}" fontId="${bold ? 1 : 0}" fillId="0" borderId="0" xfId="0"` +
    `${numFmt ? ' applyNumberFormat="1"' : ''}${bold ? ' applyFont="1"' : ''}` +
    (right ? ' applyAlignment="1"><alignment horizontal="right"/></xf>' : '/>');
  const xfs = [
    xf(0, false),
    xf(0, true),
    xf(164, false),
    xf(164, true),
    xf(165, false),
    xf(166, false),
    xf(166, true),
    xf(0, true, true),
  ];
  return (
    XML_HEAD +
    `<styleSheet xmlns="${MAIN_NS}">` +
    `<numFmts count="3"><numFmt numFmtId="164" formatCode="${escape(money)}"/>` +
    '<numFmt numFmtId="165" formatCode="mmm d, yyyy"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, col) => cellXml(cell, `${columnName(col)}${r + 1}`)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  const cols = sheet.widths?.length
    ? '<cols>' +
      sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') +
      '</cols>'
    : '';
  return (
    XML_HEAD +
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    sheetViews(sheet.freeze) +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  );
}

function sheetViews(freeze: Sheet['freeze']): string {
  const rows = freeze?.rows ?? 0;
  const columns = freeze?.columns ?? 0;
  if (!rows && !columns) return '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const pane = rows && columns ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight';
  const split = `${columns ? ` xSplit="${columns}"` : ''}${rows ? ` ySplit="${rows}"` : ''}`;
  const topLeft = `${columnName(columns)}${rows + 1}`;
  return (
    '<sheetViews><sheetView workbookViewId="0">' +
    `<pane${split} topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/>` +
    `<selection pane="${pane}" activeCell="${topLeft}" sqref="${topLeft}"/>` +
    '</sheetView></sheetViews>'
  );
}

function cellXml(cell: Cell, ref: string): string {
  if (cell == null || cell === '') return '';
  const { value, style } = typeof cell === 'object' ? cell : { value: cell, style: undefined };
  const s = style ? ` s="${STYLE_INDEX[style]}"` : '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  }
  const space = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t${space}>${escape(value)}</t></is></c>`;
}

function escape(text: string): string {
  return (
    text
      // Characters XML doesn't allow at all.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

/** UTF-8 bytes of a string. */
export function utf8(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 3);
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low < 0xe000) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    // A lone half of a surrogate pair isn't a character.
    if (code >= 0xd800 && code < 0xe000) code = 0xfffd;
    if (code < 0x80) {
      out[n++] = code;
    } else if (code < 0x800) {
      out[n++] = 0xc0 | (code >> 6);
      out[n++] = 0x80 | (code & 63);
    } else if (code < 0x10000) {
      out[n++] = 0xe0 | (code >> 12);
      out[n++] = 0x80 | ((code >> 6) & 63);
      out[n++] = 0x80 | (code & 63);
    } else {
      out[n++] = 0xf0 | (code >> 18);
      out[n++] = 0x80 | ((code >> 12) & 63);
      out[n++] = 0x80 | ((code >> 6) & 63);
      out[n++] = 0x80 | (code & 63);
    }
  }
  return out.slice(0, n);
}

let crcTable: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip archive with each file stored as is. */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 1 January 2026, midnight, in DOS format: the date doesn't matter, it only has to be valid.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = utf8(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
