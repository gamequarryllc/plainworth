import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BackupError, backupFileName, makeBackup, readBackup } from '../../store/backup';
import { DATA_VERSION, emptyData } from '../../store/defaults';

function sample() {
  const data = emptyData();
  data.accounts = [{ id: 'a', name: 'Checking', categoryId: 'cash', createdAt: 1, closed: false }];
  data.snapshots = [{ id: '1', accountId: 'a', date: '2026-10-20', value: 1_500_00, createdAt: 1, note: 'Paycheck' }];
  data.spend = { '2026-10': { rent: 1_250_00, 'paycheck-1': 2_000_00 } };
  data.monthNotes = { '2026-10': 'Trip' };
  data.settings.currency = 'EUR';
  return data;
}

test('backup: everything comes back as it was', () => {
  const data = sample();
  assert.equal(backupFileName('2026-11-01'), 'Plainworth Backup 2026-11-01.plainworth');
  const restored = readBackup(makeBackup(data, '2026-11-01'));
  assert.equal(restored.date, '2026-11-01');
  assert.deepEqual(restored.data, data);
});

test('backup: an older format is brought up to date, including from when the app was called Tally', () => {
  const old = sample() as unknown as Record<string, unknown>;
  // Up to version 3 there was an Invested group; it's dropped on restore.
  old.spendCategories = [...(old.spendCategories as object[]), { id: 'investing', name: 'Investing', group: 'invest', order: 0, hidden: false }];
  const text = JSON.stringify({ app: 'Tally', version: 1, date: '2025-06-01', data: { ...old, version: 1 } });
  const { data } = readBackup(text);
  assert.equal(data.version, DATA_VERSION);
  assert.ok(!data.spendCategories.some((c) => (c.group as string) === 'invest'));
  assert.equal(data.accounts[0].name, 'Checking');
});

test('backup: files that could do harm are turned away', () => {
  const message = (text: string) => {
    try {
      readBackup(text);
    } catch (e) {
      assert.ok(e instanceof BackupError);
      return e.message;
    }
    assert.fail('should not restore');
  };
  assert.match(message('not json'), /isn’t a Plainworth backup/);
  assert.match(message('{"hello":1}'), /isn’t a Plainworth backup/);
  // A spreadsheet or something else entirely.
  assert.match(message('PK\u0003\u0004'), /isn’t a Plainworth backup/);
  const good = JSON.parse(makeBackup(sample(), '2026-11-01'));
  assert.match(message(JSON.stringify({ ...good, version: DATA_VERSION + 1 })), /newer version/);
  const broken = (patch: Record<string, unknown>) => JSON.stringify({ ...good, data: { ...good.data, ...patch } });
  assert.match(message(broken({ accounts: 'nope' })), /damaged/);
  assert.match(message(broken({ snapshots: [{ id: '1', accountId: 'a', date: '2026-10-20', value: '1500' }] })), /damaged/);
  assert.match(message(broken({ snapshots: [{ id: '1', accountId: 'a', date: 'Oct 20', value: 1 }] })), /damaged/);
  assert.match(message(broken({ spend: { '2026-10': { rent: 'lots' } } })), /damaged/);
  assert.match(message(broken({ settings: 'x' })), /damaged/);
});
