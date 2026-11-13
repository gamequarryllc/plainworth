import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readBackup, makeBackup } from '../../store/backup';
import { DATA_VERSION, emptyData } from '../../store/defaults';
import {
  CloudNotSetUp,
  createSync,
  STOP_FILE,
  type CloudFolder,
  type SyncState,
  type SyncStatus,
} from '../sync/engine';
import { canon, merge, newMeta, stampChanges, syncedPart, type Replica } from '../sync/merge';
import type { Data } from '../types';

// ---------------------------------------------------------------------------
// A pretend iCloud folder and pretend devices
// ---------------------------------------------------------------------------

class Folder implements CloudFolder {
  files = new Map<string, { text: string; rev: number }>();
  online = true;
  /** False for a build signed without its iCloud permission: signed in, but no container to open. */
  container = true;
  private rev = 0;
  async available() {
    return this.online;
  }
  async list() {
    if (!this.container) throw new CloudNotSetUp();
    return [...this.files.keys()];
  }
  async signature(name: string) {
    const f = this.files.get(name);
    return f ? String(f.rev) : null;
  }
  async read(name: string) {
    return this.files.get(name)?.text ?? null;
  }
  async write(name: string, text: string) {
    this.files.set(name, { text, rev: ++this.rev });
  }
  async remove(name: string) {
    this.files.delete(name);
  }
}

let clock = 1_000_000;
let ids = 0;

function device(folder: Folder, name: string, opts: { dataVersion?: number; skew?: number } = {}) {
  const d = {
    name,
    data: emptyData(),
    saved: null as SyncState | null,
    replaced: [] as { data: Data; from: string }[],
    status: null as SyncStatus | null,
    change(fn: (data: Data) => Partial<Data>) {
      const prev = d.data;
      d.data = { ...prev, ...fn(structuredClone(prev)) };
      clock += 10;
      d.sync.localChange(prev, d.data);
    },
    replace(data: Data) {
      d.data = data;
      clock += 10;
      d.sync.localReplace();
    },
    sync: null as unknown as ReturnType<typeof createSync>,
  };
  d.sync = createSync({
    cloud: folder,
    dataVersion: opts.dataVersion ?? DATA_VERSION,
    getData: () => d.data,
    setData: (data) => {
      d.data = data;
    },
    readData: (data, version) => {
      try {
        return readBackup(JSON.stringify({ app: 'Plainworth', version, date: '2026-01-01', data })).data;
      } catch {
        return null;
      }
    },
    loadState: () => d.saved,
    saveState: (s) => {
      d.saved = s ? structuredClone(s) : null;
    },
    keepReplaced: (data, from) => d.replaced.push({ data, from }),
    onStatus: (s) => {
      d.status = s;
    },
    now: () => clock + (opts.skew ?? 0),
    newId: () => `${name}-${++ids}`,
  });
  return d;
}

type Device = ReturnType<typeof device>;

const addAccount = (id: string, name: string, value: number) => (data: Data) => ({
  accounts: [...data.accounts, { id, name, categoryId: 'cash', createdAt: clock, closed: false }],
  snapshots: [...data.snapshots, { id: `${id}-1`, accountId: id, date: '2026-11-01', value, createdAt: clock }],
});

/** Sync every device a few times, as the app does on a timer. */
async function settle(...devices: Device[]) {
  for (let round = 0; round < 4; round++) for (const d of devices) await d.sync.sync();
}

const same = (a: Device, b: Device) => assert.equal(canon(syncedPart(a.data)), canon(syncedPart(b.data)));

async function pair() {
  const folder = new Folder();
  const a = device(folder, 'a');
  const b = device(folder, 'b');
  a.change(addAccount('checking', 'Checking', 100_00));
  a.change(() => ({ spend: { '2026-10': { rent: 1_200_00 } } }));
  await a.sync.enable('device');
  await b.sync.enable('icloud');
  return { folder, a, b };
}

// ---------------------------------------------------------------------------
// Turning it on
// ---------------------------------------------------------------------------

test('sync: off until turned on, and nothing is written to iCloud before then', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  a.change(addAccount('checking', 'Checking', 100_00));
  await a.sync.sync();
  assert.equal(folder.files.size, 0);
  assert.equal(a.sync.status().on, false);
});

test('sync: a second, empty phone gets everything from the first', async () => {
  const { a, b } = await pair();
  assert.equal(b.data.accounts.length, 1);
  assert.equal(b.data.snapshots[0].value, 100_00);
  assert.equal(b.data.spend['2026-10'].rent, 1_200_00);
  assert.equal(b.replaced.length, 0);
  same(a, b);
});

test('sync: before turning on, a phone can see whether iCloud already has data', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  assert.deepEqual(await a.sync.look(), { available: true, cloud: null });
  a.change(addAccount('checking', 'Checking', 100_00));
  await a.sync.enable('device');
  const b = device(folder, 'b');
  const seen = await b.sync.look();
  assert.equal(seen.cloud?.data.accounts[0].name, 'Checking');
  folder.online = false;
  assert.equal((await b.sync.look()).available, false);
});

test('sync: choosing iCloud over a phone with its own data keeps a copy of what was replaced', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  const b = device(folder, 'b');
  a.change(addAccount('checking', 'Checking', 100_00));
  b.change(addAccount('savings', 'Savings', 500_00));
  await a.sync.enable('device');
  await b.sync.enable('icloud');
  assert.deepEqual(
    b.data.accounts.map((x) => x.name),
    ['Checking'],
  );
  assert.equal(b.replaced[0].from, 'device');
  assert.equal(b.replaced[0].data.accounts[0].name, 'Savings');
});

test('sync: choosing this phone over iCloud replaces the data on the other phone too', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  const b = device(folder, 'b');
  a.change(addAccount('checking', 'Checking', 100_00));
  b.change(addAccount('savings', 'Savings', 500_00));
  await a.sync.enable('device');
  await b.sync.enable('device');
  assert.equal(b.replaced[0].from, 'icloud');
  assert.equal(b.replaced[0].data.accounts[0].name, 'Checking');
  await settle(a, b);
  assert.deepEqual(
    a.data.accounts.map((x) => x.name),
    ['Savings'],
  );
  assert.equal(a.replaced[0].data.accounts[0].name, 'Checking');
  same(a, b);
});

// ---------------------------------------------------------------------------
// Changes going back and forth
// ---------------------------------------------------------------------------

test('sync: changes go both ways, and different things changed on each phone are both kept', async () => {
  const { a, b } = await pair();
  a.change((d) => ({
    snapshots: [
      ...d.snapshots,
      { id: 'n1', accountId: 'checking', date: '2026-11-05', value: 150_00, createdAt: clock },
    ],
  }));
  b.change((d) => ({ spend: { ...d.spend, '2026-11': { groceries: 300_00 } }, monthNotes: { '2026-11': 'Trip' } }));
  await settle(a, b);
  for (const d of [a, b]) {
    assert.equal(d.data.snapshots.length, 2);
    assert.equal(d.data.spend['2026-11'].groceries, 300_00);
    assert.equal(d.data.spend['2026-10'].rent, 1_200_00);
    assert.equal(d.data.monthNotes['2026-11'], 'Trip');
  }
  same(a, b);
});

test('sync: two balances entered on the same day on different phones are both kept', async () => {
  const { a, b } = await pair();
  a.change((d) => ({
    snapshots: [
      ...d.snapshots,
      { id: 'a1', accountId: 'checking', date: '2026-11-05', value: 150_00, createdAt: clock },
    ],
  }));
  b.change((d) => ({
    snapshots: [
      ...d.snapshots,
      { id: 'b1', accountId: 'checking', date: '2026-11-05', value: 175_00, createdAt: clock },
    ],
  }));
  await settle(a, b);
  assert.deepEqual(a.data.snapshots.map((s) => s.id).sort(), ['a1', 'b1', 'checking-1']);
  same(a, b);
});

test('sync: when both phones change the same thing, the later change wins on both', async () => {
  const { a, b } = await pair();
  a.change((d) => ({ accounts: d.accounts.map((x) => ({ ...x, name: 'Chase Checking' })) }));
  b.change((d) => ({ accounts: d.accounts.map((x) => ({ ...x, name: 'Everyday' })) }));
  a.change((d) => ({ spend: { ...d.spend, '2026-10': { rent: 1_300_00 } } }));
  await settle(b, a);
  assert.equal(a.data.accounts[0].name, 'Everyday');
  assert.equal(b.data.accounts[0].name, 'Everyday');
  assert.equal(b.data.spend['2026-10'].rent, 1_300_00);
  same(a, b);
});

test('sync: a phone whose clock is behind still wins when its change really came later', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  const b = device(folder, 'b', { skew: -3_600_000 });
  a.change(addAccount('checking', 'Checking', 100_00));
  await a.sync.enable('device');
  await b.sync.enable('icloud');
  a.change((d) => ({ accounts: d.accounts.map((x) => ({ ...x, name: 'First' })) }));
  await settle(a, b);
  b.change((d) => ({ accounts: d.accounts.map((x) => ({ ...x, name: 'Second' })) }));
  await settle(a, b);
  assert.equal(a.data.accounts[0].name, 'Second');
  same(a, b);
});

test('sync: deleting on one phone deletes on the other, and it stays deleted', async () => {
  const { a, b } = await pair();
  a.change(addAccount('old', 'Old Card', 20_00));
  await settle(a, b);
  assert.equal(b.data.accounts.length, 2);
  b.change((d) => ({
    accounts: d.accounts.filter((x) => x.id !== 'old'),
    snapshots: d.snapshots.filter((s) => s.accountId !== 'old'),
    spend: {},
  }));
  await settle(a, b);
  assert.deepEqual(
    a.data.accounts.map((x) => x.id),
    ['checking'],
  );
  assert.deepEqual(
    a.data.snapshots.map((s) => s.id),
    ['checking-1'],
  );
  assert.deepEqual(a.data.spend, {});
  // The first phone writes its file again; the account must not come back from it.
  a.change((d) => ({ monthNotes: { ...d.monthNotes, '2026-11': 'x' } }));
  await settle(a, b);
  assert.deepEqual(
    b.data.accounts.map((x) => x.id),
    ['checking'],
  );
  same(a, b);
});

test('sync: an account deleted on one phone stays deleted even if the other phone edited it meanwhile', async () => {
  const { a, b } = await pair();
  a.change((d) => ({ accounts: [], snapshots: [] }));
  b.change((d) => ({
    accounts: d.accounts.map((x) => ({ ...x, name: 'Renamed' })),
    snapshots: [...d.snapshots, { id: 'late', accountId: 'checking', date: '2026-11-06', value: 1, createdAt: clock }],
  }));
  await settle(a, b);
  assert.equal(a.data.accounts.length, 0);
  assert.equal(b.data.accounts.length, 0);
  assert.equal(b.data.snapshots.length, 0);
  same(a, b);
});

test('sync: a category deleted on one phone stays if the other phone just put an account in it', async () => {
  const { a, b } = await pair();
  a.change((d) => ({ nwCategories: d.nwCategories.filter((c) => c.id !== 'crypto') }));
  b.change((d) => ({
    accounts: [...d.accounts, { id: 'btc', name: 'Bitcoin', categoryId: 'crypto', createdAt: clock, closed: false }],
  }));
  await settle(a, b);
  for (const d of [a, b]) {
    assert.ok(d.data.nwCategories.some((c) => c.id === 'crypto'));
    assert.ok(d.data.accounts.some((x) => x.id === 'btc'));
  }
  same(a, b);
});

test('sync: an amount cleared on one phone and entered again later comes back', async () => {
  const { a, b } = await pair();
  a.change(() => ({ spend: {} }));
  await settle(a, b);
  assert.deepEqual(b.data.spend, {});
  b.change(() => ({ spend: { '2026-10': { rent: 900_00 } } }));
  await settle(a, b);
  assert.equal(a.data.spend['2026-10'].rent, 900_00);
  same(a, b);
});

test('sync: goals and currency follow you; the lock, hidden amounts and reminders stay with each phone', async () => {
  const { a, b } = await pair();
  a.change((d) => ({
    settings: {
      ...d.settings,
      currency: 'EUR',
      goal: { amount: 1_000_000_00 },
      hideAmounts: true,
      requireUnlock: true,
      nwRange: 'ALL',
      reminder: { ...d.settings.reminder, on: true },
    },
  }));
  await settle(a, b);
  assert.equal(b.data.settings.currency, 'EUR');
  assert.equal(b.data.settings.goal?.amount, 1_000_000_00);
  assert.equal(b.data.settings.hideAmounts, false);
  assert.equal(b.data.settings.requireUnlock, false);
  assert.equal(b.data.settings.nwRange, '6M');
  assert.equal(b.data.settings.reminder.on, false);
  b.change((d) => ({ settings: { ...d.settings, goal: undefined } }));
  await settle(a, b);
  assert.equal(a.data.settings.goal, undefined);
  assert.equal(a.data.settings.hideAmounts, true);
});

test('sync: a phone that was offline catches up, and its own changes still go out', async () => {
  const { folder, a, b } = await pair();
  folder.online = false;
  b.change(addAccount('cash', 'Wallet', 40_00));
  await b.sync.sync();
  assert.equal(b.sync.status().problem, 'no-icloud');
  folder.online = true;
  a.change(addAccount('ira', 'Roth IRA', 9_000_00));
  await settle(a, b);
  assert.equal(b.sync.status().problem, undefined);
  assert.deepEqual(a.data.accounts.map((x) => x.id).sort(), ['cash', 'checking', 'ira']);
  same(a, b);
});

test('sync: three devices all end up the same', async () => {
  const { folder, a, b } = await pair();
  const c = device(folder, 'c');
  await c.sync.enable('icloud');
  a.change(addAccount('one', 'One', 1));
  b.change(addAccount('two', 'Two', 2));
  c.change(addAccount('three', 'Three', 3));
  c.change((d) => ({ accounts: d.accounts.filter((x) => x.id !== 'checking') }));
  await settle(a, b, c);
  assert.deepEqual(a.data.accounts.map((x) => x.id).sort(), ['one', 'three', 'two']);
  same(a, b);
  same(b, c);
});

test('sync: once everything is the same, the phones stop writing to iCloud', async () => {
  const { folder, a, b } = await pair();
  a.change(addAccount('one', 'One', 1));
  await settle(a, b);
  const before = canon([...folder.files.entries()]);
  await settle(a, b);
  await settle(b, a);
  assert.equal(canon([...folder.files.entries()]), before);
});

test('sync: what a phone remembers survives closing the app', async () => {
  const { folder, a, b } = await pair();
  a.change(addAccount('one', 'One', 1));
  // Closed before it could sync: a new engine starts from what was saved.
  const again = device(folder, 'a2');
  again.data = a.data;
  again.saved = a.saved;
  again.sync = createSyncLike(again, folder);
  await settle(again, b);
  assert.ok(b.data.accounts.some((x) => x.id === 'one'));
});

function createSyncLike(d: Device, folder: Folder) {
  // Same wiring as `device`, but loading the saved state given.
  const fresh = device(folder, d.name);
  const saved = d.saved;
  const data = d.data;
  const holder = { data };
  return createSync({
    cloud: folder,
    dataVersion: DATA_VERSION,
    getData: () => holder.data,
    setData: (next) => {
      holder.data = next;
      d.data = next;
    },
    readData: (raw, version) =>
      readBackup(JSON.stringify({ app: 'Plainworth', version, date: '2026-01-01', data: raw })).data,
    loadState: () => saved,
    saveState: () => {},
    keepReplaced: () => {},
    onStatus: () => {},
    now: () => clock,
    newId: () => `${fresh.name}-${++ids}`,
  });
}

// ---------------------------------------------------------------------------
// Replacing everything, and turning it off
// ---------------------------------------------------------------------------

test('sync: restoring a backup on one phone replaces the data on the other, without merging the old data back', async () => {
  const { a, b } = await pair();
  b.change(addAccount('extra', 'Extra', 5));
  const backup = emptyData();
  backup.accounts = [{ id: 'restored', name: 'From Backup', categoryId: 'cash', createdAt: 1, closed: false }];
  a.replace(backup);
  await settle(a, b);
  assert.deepEqual(
    a.data.accounts.map((x) => x.id),
    ['restored'],
  );
  assert.deepEqual(
    b.data.accounts.map((x) => x.id),
    ['restored'],
  );
  assert.ok(b.replaced[0].data.accounts.some((x) => x.id === 'extra'));
  same(a, b);
});

test('sync: turning it off keeps the data on the phone and stops sending changes', async () => {
  const { folder, a, b } = await pair();
  await b.sync.disable(false);
  assert.equal(b.data.accounts.length, 1);
  b.change(addAccount('private', 'Private', 1));
  a.change(addAccount('one', 'One', 1));
  await settle(a, b);
  assert.ok(!a.data.accounts.some((x) => x.id === 'private'));
  assert.ok(!b.data.accounts.some((x) => x.id === 'one'));
  assert.ok(![...folder.files.values()].some((f) => f.text.includes('Private')));
});

test('sync: deleting from iCloud removes every copy there, and the other phone stops but keeps its data', async () => {
  const { folder, a, b } = await pair();
  await a.sync.disable(true);
  assert.deepEqual([...folder.files.keys()], [STOP_FILE]);
  b.change(addAccount('one', 'One', 1));
  await b.sync.sync();
  assert.equal(b.sync.status().on, false);
  assert.equal(b.sync.status().stoppedElsewhere, true);
  assert.equal(b.data.accounts.length, 2);
  assert.deepEqual([...folder.files.keys()], [STOP_FILE]);
  // Turning it on again later starts clean.
  await a.sync.enable('device');
  assert.equal(a.sync.status().on, true);
  await a.sync.sync();
  assert.equal(a.sync.status().on, true);
  assert.equal(folder.files.size, 2);
});

test('sync: a phone on an older Plainworth waits for the update instead of mangling newer data', async () => {
  const folder = new Folder();
  const a = device(folder, 'a', { dataVersion: DATA_VERSION + 1 });
  a.change(addAccount('checking', 'Checking', 100_00));
  await a.sync.enable('device');
  const old = device(folder, 'old');
  old.saved = { ...structuredClone(a.saved!), deviceId: 'old' };
  old.sync = createSyncLike(old, folder);
  await old.sync.sync();
  assert.equal(old.sync.status().problem, 'update-needed');
  assert.equal(folder.files.size, 1);
});

test('sync: a build with no iCloud container says so instead of turning on and failing', async () => {
  const folder = new Folder();
  folder.container = false;
  const a = device(folder, 'a');
  a.change(addAccount('checking', 'Checking', 100_00));
  await assert.rejects(a.sync.look(), CloudNotSetUp);
  await assert.rejects(a.sync.enable('device'), CloudNotSetUp);
  assert.equal(a.sync.status().on, false);
  assert.equal(folder.files.size, 0);
  // A device that had sync on before reports it plainly, and picks up once the container is there.
  folder.container = true;
  await a.sync.enable('device');
  folder.container = false;
  a.change(addAccount('one', 'One', 1));
  await a.sync.sync();
  assert.equal(a.sync.status().problem, 'not-set-up');
  folder.container = true;
  await a.sync.sync();
  assert.equal(a.sync.status().problem, undefined);
  assert.ok([...folder.files.values()][0].text.includes('"One"'));
});

test('sync: a damaged file from another device is skipped, not merged', async () => {
  const { folder, a, b } = await pair();
  await folder.write('junk.json', '{"app":"Plainworth","format":1,"dataVersion":3,"epoch":');
  await folder.write('other.json', JSON.stringify({ hello: 'world' }));
  a.change(addAccount('one', 'One', 1));
  await settle(a, b);
  assert.equal(a.sync.status().problem, undefined);
  assert.ok(b.data.accounts.some((x) => x.id === 'one'));
});

// ---------------------------------------------------------------------------
// The merge itself
// ---------------------------------------------------------------------------

test('merge: merging the same copy twice changes nothing, in either direction', () => {
  const epoch = { id: 'e', at: 100 };
  const base = emptyData();
  let a: Replica = { data: base, meta: newMeta(epoch) };
  let b: Replica = { data: base, meta: newMeta(epoch) };
  const edit = (r: Replica, at: number, fn: (d: Data) => Partial<Data>): Replica => {
    const next = { ...r.data, ...fn(structuredClone(r.data)) };
    return { data: next, meta: stampChanges(r.data, next, r.meta, at) ?? r.meta };
  };
  a = edit(a, 200, addAccount('x', 'X', 1));
  a = edit(a, 210, (d) => ({ spend: { '2026-01': { rent: 5 } }, nwCategories: d.nwCategories.slice(1) }));
  b = edit(b, 205, addAccount('y', 'Y', 2));
  b = edit(b, 220, (d) => ({ spend: { '2026-01': { rent: 7, gas: 1 } }, settings: { ...d.settings, name: 'Sam' } }));
  const ab = merge(a, b);
  const ba = merge(b, a);
  assert.equal(canon(syncedPart(ab.data)), canon(syncedPart(ba.data)));
  assert.equal(canon(ab.meta), canon(ba.meta));
  assert.equal(ab.data.spend['2026-01'].rent, 7);
  assert.equal(merge(ab, b).changed, false);
  assert.equal(merge(ab, a).changed, false);
  assert.equal(merge(ab, ba).changed, false);
});

test('merge: two automatic metal prices for the same day become one', () => {
  const epoch = { id: 'e', at: 100 };
  const base = emptyData();
  base.accounts = [{ id: 'gold', name: 'Gold', categoryId: 'metals', createdAt: 1, closed: false, metal: 'XAU' }];
  const spot = (id: string, createdAt: number) => ({
    id,
    accountId: 'gold',
    date: '2026-11-10',
    value: 100,
    createdAt,
    source: 'spot' as const,
  });
  const a0: Replica = { data: base, meta: newMeta(epoch) };
  const aData = { ...base, snapshots: [spot('s-a', 500)] };
  const bData = { ...base, snapshots: [spot('s-b', 600)] };
  const a: Replica = { data: aData, meta: stampChanges(base, aData, a0.meta, 500)! };
  const b: Replica = { data: bData, meta: stampChanges(base, bData, a0.meta, 600)! };
  const ab = merge(a, b);
  const ba = merge(b, a);
  assert.deepEqual(
    ab.data.snapshots.map((s) => s.id),
    ['s-b'],
  );
  assert.deepEqual(
    ba.data.snapshots.map((s) => s.id),
    ['s-b'],
  );
  assert.equal(merge(ab, ba).changed, false);
});

test('merge: only real changes are noted', () => {
  const meta = newMeta({ id: 'e', at: 100 });
  const data = emptyData();
  assert.equal(stampChanges(data, { ...data }, meta, 200), null);
  assert.equal(
    stampChanges(data, { ...data, settings: { ...data.settings, nwRange: 'ALL', hideAmounts: true } }, meta, 200),
    null,
  );
  assert.equal(stampChanges(data, { ...data, accounts: [...data.accounts] }, meta, 200), null);
  const renamed = { ...data, settings: { ...data.settings, name: 'Sam' } };
  assert.deepEqual(stampChanges(data, renamed, meta, 200)?.stamps, { 'o:name': 200 });
  assert.deepEqual(stampChanges(renamed, data, meta, 300)?.tombs, { 'o:name': 300 });
});

test('sync: the iCloud file is something a backup restore would accept', async () => {
  const { folder, a } = await pair();
  const file = JSON.parse([...folder.files.values()][0].text);
  assert.equal(file.app, 'Plainworth');
  assert.equal(file.dataVersion, DATA_VERSION);
  assert.equal(file.data.settings.requireUnlock, undefined);
  const back = readBackup(makeBackup(file.data, '2026-11-01'));
  assert.equal(back.data.accounts.length, a.data.accounts.length);
});
