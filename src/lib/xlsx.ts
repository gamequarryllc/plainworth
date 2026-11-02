/**
 * A small Excel (.xlsx) writer: plain values, a few number formats, bold rows,
 * column widths and frozen headers. An .xlsx file is a zip of XML parts; this
 * stores them uncompressed, which every spreadsheet app reads.
 */

/** The named styles the export started with. Anything else is a `Style`. */
export type NamedStyle = 'bold' | 'heading' | 'money' | 'moneyBold' | 'date' | 'percent' | 'percentBold';

/** How a cell looks. Colors are hex RGB like "1E8F46". */
export interface Style {
  bold?: boolean;
  italic?: boolean;
  /** Font size in points; 11 when not set. */
  size?: number;
  color?: string;
  fill?: string;
  /** `signedMoney` shows a + on gains. */
  format?: 'money' | 'signedMoney' | 'date' | 'percent';
  align?: 'left' | 'center' | 'right';
  top?: 'thin' | 'medium' | 'double';
  bottom?: 'thin' | 'medium' | 'double';
  /** Color of the top and bottom borders. */
  borderColor?: string;
}

export type CellStyle = NamedStyle | Style;

/** An empty string with a style is a blank cell that still shows its fill and borders. */
export type Cell = string | number | null | undefined | { value: string | number; style: CellStyle };

export interface Sheet {
  /** Up to 31 characters; unique within the workbook. */
  name: string;
  rows: Cell[][];
  /** Column widths, in characters. */
  widths?: number[];
  /** Row heights in points, by row index. */
  heights?: Record<number, number>;
  /** Rows and columns that stay in view while scrolling. */
  freeze?: { rows?: number; columns?: number };
  /** False hides the gridlines, for a sheet laid out like a page. */
  gridlines?: boolean;
  /** The sheet tab's color, hex RGB. */
  tabColor?: string;
  /** Printing fits the sheet to the page width, in this orientation. */
  print?: 'portrait' | 'landscape';
}

const NAMED: Record<NamedStyle, Style> = {
  bold: { bold: true },
  heading: { bold: true, align: 'right' },
  money: { format: 'money' },
  moneyBold: { format: 'money', bold: true },
  date: { format: 'date' },
  percent: { format: 'percent' },
  percentBold: { format: 'percent', bold: true },
};

/** The full look of a style, named or not. */
export function resolveStyle(style: CellStyle | undefined): Style {
  if (!style) return {};
  return typeof style === 'string' ? NAMED[style] : style;
}

/** The workbook's bytes. `money` is the number format for amounts, see `moneyFormat`. */
export function buildWorkbook(sheets: Sheet[], money: string): Uint8Array {
  const styles = new StyleTable();
  const sheetFiles = sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, styles)]);
  const files: [string, string][] = [
    ['[Content_Types].xml', contentTypes(sheets.length)],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', workbookXml(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRels(sheets.length)],
    ['xl/styles.xml', styles.xml(money)],
    ...sheetFiles,
  ];
  return zip(files.map(([name, xml]) => ({ name, data: utf8(xml) })));
}

/** An Excel number format for amounts in a currency, e.g. "$"#,##0.00. */
export function moneyFormat(symbol: string, decimals: number): string {
  return `"${symbol.replace(/"/g, '')}"#,##0${decimals > 0 ? '.' + '0'.repeat(decimals) : ''}`;
}

/** The money format with a + on gains: +"$"#,##0.00;-"$"#,##0.00;"$"#,##0.00. */
export function signedFormat(money: string): string {
  return `+${money};-${money};${money}`;
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

const FORMAT_ID = {
  money: 164,
  date: 165,
  percent: 166,
  signedMoney: 167,
} as const;

/** Fonts, fills, borders and cell formats, each written once and shared by every cell that uses it. */
class StyleTable {
  private fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
  // Excel requires these two fills first.
  private fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  private borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private ids = new Map<string, number>();

  /** The index for a cell's `s` attribute; 0 is the default look. */
  index(style: Style): number {
    const key = JSON.stringify([
      style.bold,
      style.italic,
      style.size,
      style.color,
      style.fill,
      style.format,
      style.align,
      style.top,
      style.bottom,
      style.borderColor,
    ]);
    const known = this.ids.get(key);
    if (known != null) return known;
    const font = this.add(
      this.fonts,
      '<font>' +
        (style.bold ? '<b/>' : '') +
        (style.italic ? '<i/>' : '') +
        `<sz val="${style.size ?? 11}"/>` +
        (style.color ? `<color rgb="FF${style.color.toUpperCase()}"/>` : '') +
        '<name val="Calibri"/><family val="2"/></font>',
    );
    const fill = style.fill
      ? this.add(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const edge = (side: 'top' | 'bottom', kind?: string) =>
      kind
        ? `<${side} style="${kind}">${style.borderColor ? `<color rgb="FF${style.borderColor.toUpperCase()}"/>` : '<color auto="1"/>'}</${side}>`
        : `<${side}/>`;
    const border =
      style.top || style.bottom
        ? this.add(
            this.borders,
            `<border><left/><right/>${edge('top', style.top)}${edge('bottom', style.bottom)}<diagonal/></border>`,
          )
        : 0;
    const numFmt = style.format ? FORMAT_ID[style.format] : 0;
    const xf =
      `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      (numFmt ? ' applyNumberFormat="1"' : '') +
      (font ? ' applyFont="1"' : '') +
      (fill ? ' applyFill="1"' : '') +
      (border ? ' applyBorder="1"' : '') +
      (style.align ? ` applyAlignment="1"><alignment horizontal="${style.align}"/></xf>` : '/>');
    const id = this.add(this.xfs, xf);
    this.ids.set(key, id);
    return id;
  }

  private add(list: string[], xml: string): number {
    const at = list.indexOf(xml);
    if (at >= 0) return at;
    list.push(xml);
    return list.length - 1;
  }

  xml(money: string): string {
    return (
      XML_HEAD +
      `<styleSheet xmlns="${MAIN_NS}">` +
      `<numFmts count="4"><numFmt numFmtId="164" formatCode="${escape(money)}"/>` +
      '<numFmt numFmtId="165" formatCode="mmm d, yyyy"/><numFmt numFmtId="166" formatCode="0.0%"/>' +
      `<numFmt numFmtId="167" formatCode="${escape(signedFormat(money))}"/></numFmts>` +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

function sheetXml(sheet: Sheet, styles: StyleTable): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, col) => cellXml(cell, `${columnName(col)}${r + 1}`, styles)).join('');
      const height = sheet.heights?.[r];
      const ht = height ? ` ht="${height}" customHeight="1"` : '';
      return cells || ht ? `<row r="${r + 1}"${ht}>${cells}</row>` : '';
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
    (sheet.tabColor || sheet.print
      ? '<sheetPr>' +
        (sheet.tabColor ? `<tabColor rgb="FF${sheet.tabColor.toUpperCase()}"/>` : '') +
        (sheet.print ? '<pageSetUpPr fitToPage="1"/>' : '') +
        '</sheetPr>'
      : '') +
    sheetViews(sheet.freeze, sheet.gridlines ?? true) +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    (sheet.print
      ? '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
        `<pageSetup orientation="${sheet.print}" fitToWidth="1" fitToHeight="0"/>`
      : '') +
    '</worksheet>'
  );
}

function sheetViews(freeze: Sheet['freeze'], gridlines: boolean): string {
  const rows = freeze?.rows ?? 0;
  const columns = freeze?.columns ?? 0;
  const view = `<sheetView${gridlines ? '' : ' showGridLines="0"'} workbookViewId="0"`;
  if (!rows && !columns) return `<sheetViews>${view}/></sheetViews>`;
  const pane = rows && columns ? 'bottomRight' : rows ? 'bottomLeft' : 'topRight';
  const split = `${columns ? ` xSplit="${columns}"` : ''}${rows ? ` ySplit="${rows}"` : ''}`;
  const topLeft = `${columnName(columns)}${rows + 1}`;
  return (
    `<sheetViews>${view}>` +
    `<pane${split} topLeftCell="${topLeft}" activePane="${pane}" state="frozen"/>` +
    `<selection pane="${pane}" activeCell="${topLeft}" sqref="${topLeft}"/>` +
    '</sheetView></sheetViews>'
  );
}

function cellXml(cell: Cell, ref: string, styles: StyleTable): string {
  if (cell == null || cell === '') return '';
  const { value, style } = typeof cell === 'object' ? cell : { value: cell, style: undefined };
  const index = style ? styles.index(resolveStyle(style)) : 0;
  const s = index ? ` s="${index}"` : '';
  if (value === '') return s ? `<c r="${ref}"${s}/>` : '';
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
