import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exportSheets, exportWorkbook } from '../export';
import { buildWorkbook, columnName, crc32, excelDate, moneyFormat, sheetName, utf8 } from '../xlsx';
import { dayNumber } from '../dates';
import { emptyData } from '../../store/defaults';

/** Reads back a stored (uncompressed) zip: name → text. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    assert.equal(crc32(data), crc, `${name} checksum`);
    files.set(name, new TextDecoder().decode(data));
    at += 30 + nameLength + size;
  }
  // The central directory lists every file, and the end record points at it.
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), files.size);
  assert.equal(view.getUint32(end + 16, true), at);
  return files;
}

test('xlsx: building blocks', () => {
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
  for (const text of ['plain', 'Café · 50 €', 'Money 💸 jar', '']) {
    assert.deepEqual(utf8(text), new TextEncoder().encode(text));
  }
  assert.deepEqual(
    [0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName),
    ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'],
  );
  assert.equal(sheetName('Spending 2026'), 'Spending 2026');
  assert.equal(sheetName('a/b:c?d*[e]'), 'a b c d  e');
  assert.equal(sheetName('x'.repeat(40)).length, 31);
  assert.equal(moneyFormat('$', 2), '"$"#,##0.00');
  assert.equal(moneyFormat('¥', 0), '"¥"#,##0');
  // 1 January 2026 is day 46023 in Excel.
  assert.equal(excelDate(dayNumber('2026-01-01')), 46023);
});

test('xlsx: a workbook is a valid zip of the expected parts', () => {
  const bytes = buildWorkbook(
    [
      {
        name: 'First',
        rows: [
          [{ value: 'Name', style: 'bold' }, { value: 'Amount', style: 'heading' }],
          ['Rent & <stuff>', { value: 12.5, style: 'money' }],
          [],
          [null, 3],
        ],
        widths: [20, 12],
        freeze: { rows: 1, columns: 1 },
      },
      { name: 'Second', rows: [['  padded  ']] },
    ],
    moneyFormat('$', 2),
  );
  const files = unzip(bytes);
  assert.deepEqual([...files.keys()], [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
  ]);
  const sheet = files.get('xl/worksheets/sheet1.xml')!;
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t>Rent &amp; &lt;stuff&gt;<\/t><\/is><\/c>/);
  // Styles are numbered in the order they're first used: bold, heading, money.
  assert.match(sheet, /<c r="B2" s="3"><v>12.5<\/v><\/c>/);
  assert.match(sheet, /<row r="4"><c r="B4"><v>3<\/v><\/c><\/row>/);
  assert.doesNotMatch(sheet, /<row r="3">/);
  assert.match(sheet, /<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"\/>/);
  assert.match(files.get('xl/worksheets/sheet2.xml')!, /<t xml:space="preserve">  padded  <\/t>/);
  assert.match(files.get('xl/workbook.xml')!, /<sheet name="Second" sheetId="2" r:id="rId2"\/>/);
  assert.match(files.get('xl/styles.xml')!, /formatCode="&quot;\$&quot;#,##0.00"/);
});

test('export: net worth by month, every balance, and a sheet per year of spending', () => {
  const data = emptyData();
  data.accounts = [
    { id: 'a', name: 'Checking', categoryId: 'cash', createdAt: 1, closed: false },
    { id: 'b', name: 'Visa', categoryId: 'credit-cards', createdAt: 2, closed: false },
  ];
  data.snapshots = [
    { id: '1', accountId: 'a', date: '2026-09-15', value: 1_000_00, createdAt: 1 },
    { id: '2', accountId: 'b', date: '2026-10-03', value: 250_00, createdAt: 2 },
    { id: '3', accountId: 'a', date: '2026-10-20', value: 1_500_00, createdAt: 3, note: 'Paycheck' },
  ];
  data.spend = {
    '2025-12': { rent: 1_200_00 },
    '2026-01': { rent: 1_250_00, groceries: 300_00, 'paycheck-1': 2_000_00 },
  };
  const sheets = exportSheets(data, '2026-11-01');
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['Overview', 'Net Worth', 'Balances', 'Spending 2026', 'Spending 2025'],
  );
  // Blank cells that only carry a fill read as empty.
  const value = (c: unknown) => {
    const v = c && typeof c === 'object' ? (c as { value: unknown }).value : c;
    return v === '' || v === undefined ? null : v;
  };
  const find = (rows: unknown[][], name: string) => rows.find((r) => value(r[0]) === name)!.map(value);

  const overview = sheets[0].rows;
  assert.equal(value(overview[0][0]), 'Plainworth');
  // Net worth today, how it moved this year, and the year's spending.
  assert.deepEqual(overview[3].map(value).slice(0, 4), ['NET WORTH', 'CHANGE IN 2026', 'SAVED IN 2026', 'SAVINGS RATE']);
  assert.deepEqual(overview[4].map(value).slice(0, 4), [1_250, 500, 450, 0.225]);
  assert.deepEqual(find(overview, 'Cash').slice(0, 3), ['Cash', 1_500, 1]);
  assert.deepEqual(find(overview, 'Credit Cards').slice(0, 2), ['Credit Cards', -250]);
  assert.deepEqual(find(overview, 'Net Worth').slice(0, 2), ['Net Worth', 1_250]);
  assert.deepEqual(find(overview, '2026 (1 month)').slice(0, 5), ['2026 (1 month)', 2_000, 1_550, 450, 0.225]);

  const nw = sheets[1].rows;
  assert.deepEqual(nw[0].map(value), ['Account', 'Category', 'Sep 2026', 'Oct 2026', 'Nov 2026']);
  assert.deepEqual(find(nw, 'Checking'), ['Checking', 'Cash', 1_000, 1_500, 1_500]);
  // No balance yet in September: left empty, not zero.
  assert.deepEqual(find(nw, 'Visa'), ['Visa', 'Credit Cards', null, 250, 250]);
  assert.deepEqual(find(nw, 'Net Worth'), ['Net Worth', null, 1_000, 1_250, 1_250]);
  // The Visa added in October counts from its first balance, so October's change is Checking's +500.
  assert.deepEqual(find(nw, 'Change'), ['Change', null, null, 500, 0]);

  const balances = sheets[2].rows;
  assert.equal(balances.length, 4);
  assert.deepEqual(balances[3].map(value), [excelDate(dayNumber('2026-10-20')), 'Checking', 'Cash', 'Asset', 1_500, 'Paycheck']);

  const year = sheets[3].rows;
  const row = (name: string) => find(year, name);
  assert.deepEqual(row('Rent').slice(0, 3), ['Rent', 1_250, null]);
  assert.deepEqual(row('Rent').slice(-2), [1_250, 1_250]);
  assert.deepEqual(row('Saved').slice(0, 2), ['Saved', 450]);
  assert.equal(row('Savings Rate')[1], 0.225);
  assert.ok(!year.map((r) => value(r[0])).includes('Invested'));

  // Styled: a navy header, and the Overview prints on one page width without gridlines.
  const files = unzip(exportWorkbook(data, '2026-11-01'));
  assert.match(files.get('xl/styles.xml')!, /<fgColor rgb="FF18202F"\/>/);
  assert.match(files.get('xl/styles.xml')!, /formatCode="\+&quot;\$&quot;#,##0.00;-&quot;\$&quot;#,##0.00;&quot;\$&quot;#,##0.00"/);
  assert.match(files.get('xl/worksheets/sheet1.xml')!, /<sheetView showGridLines="0" workbookViewId="0"\/>/);
  assert.match(files.get('xl/worksheets/sheet1.xml')!, /<pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"\/>/);

  // And it all packs into a file.
  assert.ok(exportWorkbook(data, '2026-11-01').length > 2_000);
});
