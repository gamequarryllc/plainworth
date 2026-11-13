import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { defaultSpendCategories } from '../../store/defaults';
import { buildReview, choose, pairTransfers, pickedRules, readSpreadsheet, readText, readTextWithAi, totalsOf } from '../statement';
import { chunkLines, readAiAnswer } from '../statement/ai';
import { guessCategory, merchantKey } from '../statement/categorize';
import { readLines, toLines } from '../statement/lines';
import { parseDay, parseMoney } from '../statement/parse';
import { parseCsv, readTable } from '../statement/table';
import type { Fragment, Txn } from '../statement/types';

const NOV = { year: 2026, month: 11 };
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'statements', name));
const cats = defaultSpendCategories();
const inNov = (txns: Txn[]) => txns.filter((t) => t.date?.startsWith('2026-11'));
const sum = (txns: Txn[]) => txns.reduce((s, t) => s + t.amount, 0);
const find = (txns: Txn[], text: string) => txns.find((t) => t.description.includes(text));

test('amounts as banks write them', () => {
  assert.equal(parseMoney('$1,234.56')?.cents, 123456);
  assert.deepEqual(parseMoney('-12.00'), { cents: 1200, negative: true, credit: false, plus: false });
  assert.equal(parseMoney('(45.10)')?.negative, true);
  assert.equal(parseMoney('45.10-')?.negative, true);
  assert.equal(parseMoney('45.10 CR')?.credit, true);
  assert.equal(parseMoney('1.234,56')?.cents, 123456);
  assert.equal(parseMoney('+$5.75')?.plus, true);
  assert.equal(parseMoney('12'), null);
  assert.equal(parseMoney('12', true)?.cents, 1200);
  assert.equal(parseMoney(-86.42)?.cents, 8642);
  assert.equal(parseMoney('abc'), null);
});

test('dates as banks write them', () => {
  assert.equal(parseDay('11/03/2026', NOV), '2026-11-03');
  assert.equal(parseDay('11/03/26', NOV), '2026-11-03');
  assert.equal(parseDay('11/03', NOV), '2026-11-03');
  assert.equal(parseDay('2026-11-03', NOV), '2026-11-03');
  assert.equal(parseDay('Nov 3', NOV), '2026-11-03');
  assert.equal(parseDay('November 3, 2026', NOV), '2026-11-03');
  assert.equal(parseDay('3 Nov 2026', NOV), '2026-11-03');
  assert.equal(parseDay('Tue, Nov 3', NOV), '2026-11-03');
  assert.equal(parseDay('13/11/2026', NOV), '2026-11-13');
  assert.equal(parseDay('03/11/2026', NOV, true), '2026-11-03');
  // No year: the one nearest the month being imported.
  assert.equal(parseDay('12/28', { year: 2027, month: 1 }), '2026-12-28');
  assert.equal(parseDay('01/02', { year: 2026, month: 12 }), '2027-01-02');
  assert.equal(parseDay('02/30/2026', NOV), null);
  assert.equal(parseDay(46329, NOV), '2026-11-03');
  assert.equal(parseDay('Total', NOV), null);
});

test('a checking CSV: negative is spending, the balance column is ignored', () => {
  const txns = readSpreadsheet(fixture('1-checking.csv'), NOV);
  assert.equal(txns.length, 23);
  assert.equal(inNov(txns).length, 21);
  assert.equal(find(txns, 'PAYROLL')?.amount, -245000);
  assert.equal(find(txns, 'SHELL')?.amount, 4118);
  assert.equal(find(txns, 'SHELL')?.date, '2026-11-04');
});

test('a card CSV: purchases negative, payments positive, the Type column settles it', () => {
  const txns = readSpreadsheet(fixture('2-credit-card.csv'), NOV);
  assert.equal(txns.length, 16);
  assert.equal(find(txns, 'TARGET')?.amount, 7620);
  assert.equal(find(txns, 'TARGET')?.date, '2026-11-05');
  assert.equal(find(txns, 'THANK YOU')?.amount, -62000);
  assert.equal(find(txns, 'REFUND')?.amount, -2450);
});

test('a card CSV where purchases are positive and there is no Type', () => {
  const csv = 'Date,Description,Amount\n11/02/2026,WHOLEFDS MKT,54.31\n11/05/2026,TARGET,76.20\n11/09/2026,PAYMENT - THANK YOU,-620.00\n';
  const txns = readTable(parseCsv(csv), NOV);
  assert.deepEqual(txns.map((t) => t.amount), [5431, 7620, -62000]);
});

test('CSV oddities: semicolons, quotes with commas, no header, day first', () => {
  assert.deepEqual(parseCsv('a;b\n"x;1";"say ""hi"""\n'), [['a', 'b'], ['x;1', 'say "hi"']]);
  const noHeader = readTable(parseCsv('11/03/2026,"KROGER, COLUMBUS",-86.42\n11/04/2026,SHELL OIL,-41.18\n11/16/2026,PAYROLL,2450.00\n'), NOV);
  assert.equal(noHeader.length, 3);
  assert.equal(noHeader[0].description, 'KROGER, COLUMBUS');
  assert.equal(noHeader[0].amount, 8642);
  assert.equal(noHeader[2].amount, -245000);
  const eu = readTable(parseCsv('Datum;Name;Amount\n13.11.2026;REWE;-45,10\n03.11.2026;ALDI;-12,00\n'), NOV);
  assert.deepEqual(eu.map((t) => [t.date, t.amount]), [['2026-11-13', 4510], ['2026-11-03', 1200]]);
});

test('an Excel file with a few lines above the header and Money Out / Money In columns', () => {
  const txns = readSpreadsheet(fixture('3-checking.xlsx'), NOV);
  assert.equal(txns.length, 23);
  assert.equal(find(txns, 'KROGER')?.date, '2026-10-30');
  assert.equal(find(txns, 'NETFLIX')?.amount, 1549);
  assert.equal(find(txns, 'INTEREST')?.amount, -112);
  assert.equal(sum(txns), sum(readSpreadsheet(fixture('1-checking.csv'), NOV)));
});

test('a checking statement PDF: sections say which way the money went, totals are left out', () => {
  const fragments: Fragment[] = JSON.parse(fixture('checking-pdf.json').toString());
  const txns = readText(fragments, NOV);
  assert.equal(txns.length, 23);
  assert.equal(find(txns, 'PAYROLL')?.amount, -245000);
  assert.equal(find(txns, 'INTEREST')?.amount, -112);
  assert.equal(find(txns, 'DELTA')?.amount, 31840);
  assert.equal(find(txns, 'DELTA')?.date, '2026-11-28');
  assert.equal(txns.some((t) => /total|balance/i.test(t.description)), false);
  assert.equal(sum(txns), sum(readSpreadsheet(fixture('1-checking.csv'), NOV)));
});

test('a card statement PDF, given word by word: lines are put back together', () => {
  const fragments: Fragment[] = JSON.parse(fixture('card-pdf.json').toString());
  const txns = readText(fragments, NOV);
  assert.equal(txns.length, 16);
  assert.equal(find(txns, 'TARGET')?.amount, 7620);
  assert.equal(find(txns, 'TARGET')?.date, '2026-11-05');
  assert.equal(find(txns, 'TARGET')?.description, 'TARGET 00012345');
  assert.equal(find(txns, 'THANK YOU')?.amount, -62000);
  assert.equal(find(txns, 'REFUND')?.amount, -2450);
});

test('a banking app screenshot: the day is a heading above its lines', () => {
  const txns = readLines(
    ['Activity', 'Everyday Checking', 'NOVEMBER 19, 2026', 'STARBUCKS STORE   -$5.75', 'NOVEMBER 16, 2026', 'ACME CORP PAYROLL   +$2,450.00', 'AMAZON   -$ 58.73'],
    NOV,
  );
  assert.deepEqual(txns, [
    { date: '2026-11-19', description: 'STARBUCKS STORE', amount: 575 },
    { date: '2026-11-16', description: 'ACME CORP PAYROLL', amount: -245000 },
    { date: '2026-11-16', description: 'AMAZON', amount: 5873 },
  ]);
});

test('a screenshot where the day is under each line, and one with no dates at all', () => {
  const under = readLines(['Starbucks   -$5.75', 'Nov 19 · Dining', 'Kroger   -$86.42', 'Nov 21 · Groceries'], NOV);
  assert.deepEqual(under.map((t) => t.date), ['2026-11-19', '2026-11-21']);
  const none = readLines(['Starbucks   $5.75', 'Kroger   $86.42', 'Available balance   $1,200.00'], NOV);
  assert.deepEqual(none.map((t) => [t.date, t.amount]), [[null, 575], [null, 8642]]);
});

test('a register with a running balance: the amount, not the balance', () => {
  const txns = readLines(['11/03 KROGER #442 -86.42 3,034.13', '11/16 PAYROLL 2,450.00 5,484.13', '11/19 CHECK 1021 -200.00 5,284.13'], NOV);
  assert.deepEqual(txns.map((t) => t.amount), [8642, -245000, 20000]);
});

test('lines come back together from pieces at the same height', () => {
  const f = (text: string, x: number, y: number): Fragment => ({ page: 0, text, x, y, w: 0.1, h: 0.02 });
  assert.deepEqual(toLines([f('41.18', 0.8, 0.301), f('11/04', 0.1, 0.3), f('SHELL OIL', 0.3, 0.299), f('next', 0.1, 0.34)]), [
    '11/04   SHELL OIL   41.18',
    'next',
  ]);
});

test('merchant names are the same visit to visit', () => {
  assert.equal(merchantKey('STARBUCKS STORE 12345 SEATTLE WA'), 'STARBUCKS STORE');
  assert.equal(merchantKey('Starbucks Store #991'), 'STARBUCKS STORE');
  assert.equal(merchantKey('AMAZON.COM*2K4XY'), 'AMAZON COM');
  assert.equal(merchantKey('SQ *BLUE BOTTLE 0042'), 'BLUE BOTTLE');
  assert.equal(merchantKey('POS DEBIT KROGER #442'), 'KROGER');
});

test('guesses a category from the merchant, and leaves transfers out', () => {
  const guess = (description: string, amount = 1000, remembered = {}) => guessCategory({ date: null, description, amount }, cats, remembered);
  assert.deepEqual(guess('KROGER #442'), { choice: 'groceries', sure: true });
  assert.deepEqual(guess('CHIPOTLE 1123'), { choice: 'eating-out', sure: true });
  assert.deepEqual(guess('SHELL OIL 5744'), { choice: 'gas', sure: true });
  assert.deepEqual(guess('NETFLIX.COM'), { choice: 'subscriptions', sure: true });
  assert.deepEqual(guess('OAKWOOD APARTMENTS RENT'), { choice: 'rent', sure: true });
  assert.deepEqual(guess('DELTA AIR LINES'), { choice: 'travel', sure: true });
  assert.deepEqual(guess('PLANET FITNESS'), { choice: 'exercise', sure: true });
  assert.deepEqual(guess('SUMMIT CARD AUTOPAY PAYMENT'), { choice: 'skip', sure: true });
  assert.deepEqual(guess('PAYMENT - THANK YOU', -62000), { choice: 'skip', sure: true });
  assert.deepEqual(guess('TRANSFER TO SAVINGS'), { choice: 'skip', sure: true });
  assert.deepEqual(guess('ACME CORP PAYROLL DIRECT DEP', -245000), { choice: 'paycheck-1', sure: true });
  assert.deepEqual(guess('INTEREST PAID', -112), { choice: 'other-income', sure: true });
  assert.deepEqual(guess('QUALIFIED DIVIDEND VTSAX', -4210), { choice: 'other-income', sure: true });
  // A big deposit with no employer named is most likely pay, but worth a look.
  assert.deepEqual(guess('ACH DEPOSIT 8841 PPD', -210000), { choice: 'paycheck-1', sure: false });
  assert.deepEqual(guess('WORKDAY PAYROLL', -210000), { choice: 'paycheck-1', sure: true });
  // Brokerage activity is money moving, not spending or income.
  assert.deepEqual(guess('YOU BOUGHT VANGUARD TOTAL STOCK'), { choice: 'skip', sure: true });
  assert.deepEqual(guess('ELECTRONIC FUNDS TRANSFER RECEIVED', -50000), { choice: 'skip', sure: true });
  assert.deepEqual(guess('BEST BUY 00012'), guess('BEST BUY #99'));
  assert.notEqual(guess('BEST BUY 00012').choice, 'skip');
  assert.deepEqual(guess('AMZN MKTP US REFUND', -2450), { choice: 'shopping', sure: true });
  assert.deepEqual(guess('VENMO PAYMENT JORDAN'), { choice: 'general', sure: false });
  // A card statement's payments are not income.
  assert.deepEqual(guess('CAPITAL ONE MOBILE PYMT', -91498), { choice: 'skip', sure: true });
  assert.deepEqual(guess('TEXAS ROADHOUSE #2259 PORTAGE MI'), { choice: 'eating-out', sure: true });
  assert.deepEqual(guess('JERSEY MIKES 31041 GRAND RAPIDS MI'), { choice: 'eating-out', sure: true });
  assert.deepEqual(guess('SQ *SUNROOM SUPPERS Grand Rapids MI'), { choice: 'eating-out', sure: true });
  // A choice made before wins, even over a known merchant.
  assert.deepEqual(guess('KROGER #442', 1000, { KROGER: 'general' }), { choice: 'general', sure: true });
  assert.deepEqual(guess('VENMO PAYMENT JORDAN', 1000, { 'VENMO PAYMENT': 'skip' }), { choice: 'skip', sure: true });
  // A remembered category that was since deleted is ignored.
  assert.deepEqual(guess('KROGER #442', 1000, { KROGER: 'gone' }), { choice: 'groceries', sure: true });
});

test('the review: only the month, totals by category, nothing twice', () => {
  const txns = readSpreadsheet(fixture('1-checking.csv'), NOV);
  const review = buildReview(txns, '2026-11', cats, {}, []);
  assert.equal(review.items.length, 21);
  assert.equal(review.otherMonths, 2);
  const totals = totalsOf(review.items, cats);
  assert.equal(totals.byCategory['groceries'], 8642 + 6420 + 10215);
  assert.equal(totals.byCategory['rent'], 145000);
  assert.equal(totals.byCategory['paycheck-1'], 490000);
  assert.equal(totals.byCategory['other-income'], 112);
  assert.equal(totals.income, 490112);
  // Everything out except the card payment and the transfer to savings.
  assert.equal(totals.spending, 488132 - 5510 - 145000 - 62000 - 30000);
  assert.equal(totals.count, 19);

  // Importing the same file again adds nothing.
  const again = buildReview(txns, '2026-11', cats, {}, review.items.map((i) => i.mark));
  assert.equal(again.items.every((i) => i.seen), true);
  assert.equal(totalsOf(again.items, cats).count, 0);
  // The same lines from the PDF of that statement are recognized too.
  const pdf = readText(JSON.parse(fixture('checking-pdf.json').toString()), NOV);
  const fromPdf = buildReview(pdf, '2026-11', cats, {}, review.items.map((i) => i.mark));
  assert.equal(fromPdf.items.every((i) => i.seen), true);
});

test('picking a category applies to the same merchant and is remembered', () => {
  const txns = readSpreadsheet(fixture('1-checking.csv'), NOV);
  let { items } = buildReview(txns, '2026-11', cats, {}, []);
  const kroger = items.filter((i) => i.description.includes('KROGER'));
  assert.equal(kroger.length, 2);
  items = choose(items, kroger[0].id, 'general');
  assert.deepEqual(items.filter((i) => i.description.includes('KROGER')).map((i) => i.choice), ['general', 'general']);
  assert.deepEqual(pickedRules(items), { KROGER: 'general' });
  items = choose(items, items.find((i) => i.description.includes('VENMO'))!.id, 'skip');
  assert.equal(pickedRules(items)['VENMO PAYMENT'], 'skip');
  const next = buildReview(txns, '2026-11', cats, pickedRules(items), []);
  assert.equal(next.items.find((i) => i.description.includes('VENMO'))?.choice, 'skip');
  assert.equal(totalsOf(next.items, cats).byCategory['general'], 8642 + 10215 + 6000);
});

test('two purchases of the same amount on the same day both count', () => {
  const twice: Txn[] = [
    { date: '2026-11-03', description: 'COFFEE', amount: 500 },
    { date: '2026-11-03', description: 'COFFEE', amount: 500 },
  ];
  const review = buildReview(twice, '2026-11', cats, {}, []);
  assert.notEqual(review.items[0].mark, review.items[1].mark);
  assert.equal(totalsOf(review.items, cats).count, 2);
});

test("the phone's model: its answer is read, and made-up lines are dropped", async () => {
  const source = 'Credit $24.50\nAMZN MKTP US REFUND\non Nov 18\n$54.31\nWHOLEFDS MKT 10234\non Nov 2';
  const answer = 'Nov 18 | AMZN MKTP US REFUND | $24.50 | in\nNov 2 | WHOLEFDS MKT 10234 | $54.31 | out\nNov 9 | INVENTED STORE | $99.99 | out\nSure, here you go';
  assert.deepEqual(readAiAnswer(answer, source, NOV), [
    { date: '2026-11-18', description: 'AMZN MKTP US REFUND', amount: -2450 },
    { date: '2026-11-02', description: 'WHOLEFDS MKT 10234', amount: 5431 },
  ]);
  assert.deepEqual(chunkLines(['a'.repeat(290), 'b'.repeat(290), 'c'], 500).map((c) => c.length), [290, 292]);

  const f = (text: string, y: number): Fragment => ({ page: 0, text, x: 0.1, y, w: 0.5, h: 0.02 });
  const fragments = source.split('\n').map((line, i) => f(line, 0.1 + i * 0.05));
  const withAi = await readTextWithAi(fragments, NOV, async () => answer);
  assert.equal(withAi.usedAi, true);
  assert.equal(withAi.txns.length, 2);
  // If the model fails, the rules' result is used.
  const failed = await readTextWithAi(fragments, NOV, async () => {
    throw new Error('no model');
  });
  assert.equal(failed.usedAi, false);
});

test('money moved between your own statements is left out', () => {
  const txns: Txn[] = [
    { date: '2026-11-03', description: 'ONLINE PMT TO CARD 4417', amount: 64450, source: 'checking' },
    { date: '2026-11-04', description: 'ONLINE DEPOSIT', amount: -64450, source: 'card' },
    { date: '2026-11-10', description: 'ZELLE TO SAM', amount: 30000, source: 'checking' },
    { date: '2026-11-10', description: 'MOVE MONEY', amount: 30000, source: 'checking' },
    { date: '2026-11-12', description: 'DEPOSIT', amount: -30000, source: 'savings' },
    { date: '2026-11-14', description: 'KROGER #442', amount: 5431, source: 'card' },
    // Same amount in and out of one statement is not a pair.
    { date: '2026-11-15', description: 'TARGET', amount: 2000, source: 'card' },
    { date: '2026-11-16', description: 'TARGET REFUND', amount: -2000, source: 'card' },
    // Too far apart.
    { date: '2026-11-01', description: 'CHECK 101', amount: 12345, source: 'checking' },
    { date: '2026-11-20', description: 'MISC CREDIT', amount: -12345, source: 'savings' },
  ];
  const paired = pairTransfers(txns);
  assert.deepEqual(paired.map((t) => !!t.transfer), [true, true, true, false, true, false, false, false, false, false]);
  // One deposit pairs with only one withdrawal.
  const review = buildReview(paired, '2026-11', cats, {}, []);
  const skipped = review.items.filter((i) => i.transfer);
  assert.equal(skipped.length, 4);
  assert.ok(skipped.every((i) => i.choice === 'skip' && i.sure));
  assert.equal(review.items.find((i) => i.description === 'KROGER #442')?.choice, 'groceries');
  // With only one statement nothing is paired.
  assert.ok(pairTransfers(txns.map((t) => ({ ...t, source: 'one' }))).every((t) => !t.transfer));
});
