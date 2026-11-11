import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeBackup, readBackup } from '../../store/backup';
import { DATA_VERSION, emptyData } from '../../store/defaults';
import { MAIN, profileLabel, readProfileList } from '../profiles';
import { STOP_FILE, type CloudFolder, type SyncStatus } from '../sync/engine';
import { canon, syncedPart } from '../sync/merge';
import { createProfilesSync, type ProfileRef } from '../sync/profiles';
import type { Data } from '../types';

// ---------------------------------------------------------------------------
// A pretend iCloud folder and pretend devices, each with several profiles
// ---------------------------------------------------------------------------

class Folder implements CloudFolder {
  files = new Map<string, { text: string; rev: number }>();
  /** Files that exist but that iCloud hasn't delivered to the other devices yet. */
  held = new Set<string>();
  private rev = 0;
  async available() {
    return true;
  }
  async list() {
    return [...this.files.keys()].filter((n) => !this.held.has(n));
  }
  async signature(name: string) {
    const f = this.files.get(name);
    return f ? String(f.rev) : null;
  }
  async read(name: string) {
    return this.held.has(name) ? null : (this.files.get(name)?.text ?? null);
  }
  async write(name: string, text: string) {
    this.files.set(name, { text, rev: ++this.rev });
  }
  async remove(name: string) {
    this.files.delete(name);
  }
}

let clock = 5_000_000;
let ids = 0;

function device(folder: Folder, name: string) {
  const d = {
    name,
    list: [{ id: MAIN, createdAt: 0 }] as ProfileRef[],
    gone: {} as Record<string, number>,
    data: new Map<string, Data>([[MAIN, emptyData()]]),
    saved: new Map<string, unknown>(),
    replaced: [] as { id: string; from: string }[],
    status: null as SyncStatus | null,
    /** Add a profile here, as the app does. */
    add(id: string) {
      d.list.push({ id, createdAt: ++clock });
      d.data.set(id, emptyData());
      d.sync.profileAdded();
    },
    /** Delete a profile here. */
    remove(id: string) {
      d.list = d.list.filter((p) => p.id !== id);
      d.gone[id] = ++clock;
      d.data.delete(id);
      d.sync.profileRemoved(id);
    },
    change(id: string, fn: (data: Data) => Partial<Data>) {
      const prev = d.data.get(id)!;
      const next = { ...prev, ...fn(structuredClone(prev)) };
      d.data.set(id, next);
      clock += 10;
      d.sync.localChange(id, prev, next);
    },
    names: () => d.list.map((p) => p.id).sort(),
    sync: null as unknown as ReturnType<typeof createProfilesSync>,
  };
  d.sync = createProfilesSync({
    cloud: folder,
    dataVersion: DATA_VERSION,
    profiles: () => ({ list: d.list, gone: d.gone }),
    addProfile: (p) => {
      d.list.push(p);
      d.data.set(p.id, emptyData());
    },
    removeProfile: (id, at) => {
      d.list = d.list.filter((p) => p.id !== id);
      d.gone[id] = at;
      d.data.delete(id);
    },
    getData: (id) => d.data.get(id)!,
    setData: (id, data) => {
      if (d.data.has(id)) d.data.set(id, data);
    },
    readData: (data, version) => {
      try {
        return readBackup(JSON.stringify({ app: 'Plainworth', version, date: '2026-01-01', data })).data;
      } catch {
        return null;
      }
    },
    loadState: (key) => d.saved.get(key) ?? null,
    saveState: (key, state) => {
      if (state) d.saved.set(key, structuredClone(state));
      else d.saved.delete(key);
    },
    keepReplaced: (id, _data, from) => d.replaced.push({ id, from }),
    onStatus: (s) => {
      d.status = s;
    },
    now: () => clock,
    newId: () => `${name}${++ids}`,
  });
  return d;
}

type Device = ReturnType<typeof device>;

const addAccount = (id: string, name: string, value: number) => (data: Data) => ({
  accounts: [...data.accounts, { id, name, categoryId: 'cash', createdAt: clock, closed: false }],
  snapshots: [...data.snapshots, { id: `${id}-1`, accountId: id, date: '2026-11-01', value, createdAt: clock }],
});

async function settle(...devices: Device[]) {
  for (let round = 0; round < 4; round++) for (const d of devices) await d.sync.sync();
}

const same = (a: Device, b: Device, id: string) =>
  assert.equal(canon(syncedPart(a.data.get(id)!)), canon(syncedPart(b.data.get(id)!)));

const accountNames = (d: Device, id: string) => d.data.get(id)!.accounts.map((a) => a.name);

/** Two phones in sync: Personal with a checking account, and a Business profile with its own. */
async function pair() {
  const folder = new Folder();
  const a = device(folder, 'a');
  const b = device(folder, 'b');
  a.change(MAIN, addAccount('checking', 'Checking', 100_00));
  a.add('biz');
  a.change('biz', addAccount('till', 'Till', 900_00));
  a.change('biz', (d) => ({ settings: { ...d.settings, name: 'Business' } }));
  await a.sync.enable('device');
  await b.sync.enable('icloud');
  await settle(a, b);
  return { folder, a, b };
}

// ---------------------------------------------------------------------------

test('profiles sync: nothing is written to iCloud until sync is turned on', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  a.add('biz');
  a.change('biz', addAccount('till', 'Till', 900_00));
  await a.sync.sync();
  assert.equal(folder.files.size, 0);
});

test('profiles sync: a second phone gets every profile, each with its own data', async () => {
  const { a, b } = await pair();
  assert.deepEqual(b.names(), ['biz', 'main']);
  assert.deepEqual(accountNames(b, MAIN), ['Checking']);
  assert.deepEqual(accountNames(b, 'biz'), ['Till']);
  assert.equal(b.data.get('biz')!.settings.name, 'Business');
  same(a, b, MAIN);
  same(a, b, 'biz');
});

test('profiles sync: a change in one profile never lands in another', async () => {
  const { a, b } = await pair();
  b.change('biz', addAccount('loan', 'Loan', 50_00));
  a.change(MAIN, addAccount('savings', 'Savings', 500_00));
  await settle(a, b);
  for (const d of [a, b]) {
    assert.deepEqual(accountNames(d, MAIN).sort(), ['Checking', 'Savings']);
    assert.deepEqual(accountNames(d, 'biz').sort(), ['Loan', 'Till']);
  }
});

test('profiles sync: a profile added later on one phone shows up on the other', async () => {
  const { a, b } = await pair();
  b.add('kid');
  b.change('kid', addAccount('piggy', 'Piggy Bank', 20_00));
  await settle(a, b);
  assert.deepEqual(a.names(), ['biz', 'kid', 'main']);
  assert.deepEqual(accountNames(a, 'kid'), ['Piggy Bank']);
  same(a, b, 'kid');
});

test('profiles sync: an empty new profile syncs too, and what is added to it afterwards arrives', async () => {
  const { a, b } = await pair();
  a.add('kid');
  await settle(a, b);
  assert.deepEqual(b.names(), ['biz', 'kid', 'main']);
  b.change('kid', addAccount('piggy', 'Piggy Bank', 20_00));
  await settle(a, b);
  assert.deepEqual(accountNames(a, 'kid'), ['Piggy Bank']);
});

test('profiles sync: a profile deleted on one phone is deleted on the other, and stays deleted', async () => {
  const { folder, a, b } = await pair();
  a.remove('biz');
  await settle(a, b);
  assert.deepEqual(b.names(), ['main']);
  assert.ok(b.gone.biz);
  assert.deepEqual(
    [...folder.files.keys()].filter((n) => n.startsWith('biz.')),
    [],
  );
  // A third phone turning sync on later doesn't bring it back.
  const c = device(folder, 'c');
  await c.sync.enable('icloud');
  await settle(a, b, c);
  for (const d of [a, b, c]) assert.deepEqual(d.names(), ['main']);
  assert.deepEqual(accountNames(c, MAIN), ['Checking']);
});

test('profiles sync: a list that arrives before its profile’s data waits, and never replaces the data', async () => {
  const { folder, a, b } = await pair();
  a.add('kid');
  a.change('kid', addAccount('piggy', 'Piggy Bank', 20_00));
  await a.sync.sync();
  const kidFile = [...folder.files.keys()].find((n) => n.startsWith('kid.'))!;
  folder.held.add(kidFile);
  await settle(b);
  // The other phone knows of the profile but has nothing for it yet, and has sent nothing of its own.
  assert.deepEqual(b.names(), ['biz', 'kid', 'main']);
  assert.deepEqual(
    [...folder.files.keys()].filter((n) => n.startsWith('kid.')),
    [kidFile],
  );
  folder.held.clear();
  await settle(a, b);
  assert.deepEqual(accountNames(a, 'kid'), ['Piggy Bank']);
  assert.deepEqual(accountNames(b, 'kid'), ['Piggy Bank']);
  assert.equal(a.replaced.length, 0);
});

test('profiles sync: an empty phone that turns sync on before iCloud delivers anything can’t wipe the other', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  a.change(MAIN, addAccount('checking', 'Checking', 100_00));
  await a.sync.enable('device');
  for (const n of folder.files.keys()) folder.held.add(n);
  const b = device(folder, 'b');
  await b.sync.enable('icloud');
  folder.held.clear();
  await settle(a, b);
  assert.deepEqual(accountNames(a, MAIN), ['Checking']);
  assert.deepEqual(accountNames(b, MAIN), ['Checking']);
  assert.equal(a.replaced.length, 0);
});

test('profiles sync: turning on asks only about profiles with data on both sides, and keeps the rest', async () => {
  const folder = new Folder();
  const a = device(folder, 'a');
  const b = device(folder, 'b');
  a.change(MAIN, addAccount('checking', 'Checking', 100_00));
  a.add('biz');
  a.change('biz', addAccount('till', 'Till', 900_00));
  await a.sync.enable('device');
  b.change(MAIN, addAccount('savings', 'Savings', 500_00));
  b.add('kid');
  b.change('kid', addAccount('piggy', 'Piggy Bank', 20_00));
  const seen = await b.sync.look();
  assert.deepEqual(
    seen.both.map((x) => x.id),
    [MAIN],
  );
  await b.sync.enable('device');
  await settle(a, b);
  for (const d of [a, b]) {
    assert.deepEqual(d.names(), ['biz', 'kid', 'main']);
    assert.deepEqual(accountNames(d, MAIN), ['Savings']);
    assert.deepEqual(accountNames(d, 'biz'), ['Till']);
    assert.deepEqual(accountNames(d, 'kid'), ['Piggy Bank']);
  }
  assert.deepEqual(a.replaced, [{ id: MAIN, from: 'device' }]);
});

test('profiles sync: deleting from iCloud stops every device, and each keeps all its profiles', async () => {
  const { folder, a, b } = await pair();
  await a.sync.disable(true);
  assert.deepEqual([...folder.files.keys()], [STOP_FILE]);
  await settle(b);
  assert.equal(b.status?.on, false);
  assert.equal(b.status?.stoppedElsewhere, true);
  assert.deepEqual([...folder.files.keys()], [STOP_FILE]);
  assert.deepEqual(accountNames(b, 'biz'), ['Till']);
  // Turning it on again afterwards works.
  await b.sync.enable('device');
  await a.sync.enable('icloud');
  await settle(a, b);
  same(a, b, 'biz');
  assert.equal(a.status?.on, true);
});

test('profiles sync: turning off on one phone leaves the other syncing', async () => {
  const { a, b } = await pair();
  await b.sync.disable(false);
  b.change('biz', addAccount('loan', 'Loan', 50_00));
  a.change('biz', addAccount('safe', 'Safe', 70_00));
  await settle(a, b);
  assert.deepEqual(accountNames(a, 'biz').sort(), ['Safe', 'Till']);
  assert.deepEqual(accountNames(b, 'biz').sort(), ['Loan', 'Till']);
});

test('profiles sync: state survives a relaunch', async () => {
  const { folder, a, b } = await pair();
  // The app makes a fresh sync at launch, which reads what the last one saved.
  const relaunched = device(folder, 'b');
  Object.assign(relaunched, { list: b.list, gone: b.gone, data: b.data });
  relaunched.sync = createProfilesSync({
    cloud: folder,
    dataVersion: DATA_VERSION,
    profiles: () => ({ list: relaunched.list, gone: relaunched.gone }),
    addProfile: () => {},
    removeProfile: () => {},
    getData: (id) => relaunched.data.get(id)!,
    setData: (id, data) => void relaunched.data.set(id, data),
    readData: (data) => data as Data,
    loadState: (key) => b.saved.get(key) ?? null,
    saveState: (key, state) => void b.saved.set(key, state),
    keepReplaced: () => {},
    onStatus: () => {},
    now: () => clock,
    newId: () => `b${++ids}`,
  });
  assert.equal(relaunched.sync.status().on, true);
  a.change('biz', addAccount('safe', 'Safe', 70_00));
  await a.sync.sync();
  await relaunched.sync.sync();
  assert.deepEqual(accountNames(relaunched, 'biz').sort(), ['Safe', 'Till']);
});

// ---------------------------------------------------------------------------
// The list of profiles, and backups that hold them all
// ---------------------------------------------------------------------------

test('profiles: a saved list always has the first profile and an open one', () => {
  assert.deepEqual(readProfileList(null), { active: MAIN, list: [{ id: MAIN, name: '', createdAt: 0 }], gone: {} });
  const list = readProfileList({
    active: 'nope',
    list: [{ id: 'b', name: 'Biz', createdAt: 5 }, { id: 'b' }, { id: 'bad id!' }, { id: 'x', createdAt: 1 }],
    gone: { x: 9, main: 3 },
  });
  assert.equal(list.active, MAIN);
  assert.deepEqual(
    list.list.map((p) => p.id),
    [MAIN, 'b'],
  );
  assert.deepEqual(list.gone, { x: 9 });
});

test('profiles: unnamed ones get a stand-in name', () => {
  const list = [
    { id: MAIN, name: '', createdAt: 0 },
    { id: 'a', name: ' Sam ', createdAt: 1 },
    { id: 'b', name: '', createdAt: 2 },
  ];
  assert.deepEqual(
    list.map((p) => profileLabel(p, list)),
    ['Personal', 'Sam', 'Profile 3'],
  );
});

test('backup: holds every profile, and one made before profiles still reads as a single set of data', () => {
  const personal = { ...emptyData(), ...addAccount('checking', 'Checking', 100_00)(emptyData()) };
  const biz = { ...emptyData(), ...addAccount('till', 'Till', 900_00)(emptyData()) };
  const whole = readBackup(
    makeBackup(biz, '2026-11-11', [
      { id: 'biz', createdAt: 7, data: biz },
      { id: MAIN, createdAt: 0, data: personal },
    ]),
  );
  assert.deepEqual(
    whole.profiles?.map((p) => [p.id, p.createdAt, p.data.accounts[0].name]),
    [
      ['biz', 7, 'Till'],
      [MAIN, 0, 'Checking'],
    ],
  );
  assert.equal(whole.data.accounts[0].name, 'Till');
  assert.equal(readBackup(makeBackup(personal, '2026-11-11')).profiles, null);
  // One damaged profile spoils the whole file, so a restore can't quietly drop it.
  const file = JSON.parse(makeBackup(biz, '2026-11-11', [{ id: 'biz', createdAt: 7, data: biz }]));
  file.others = [{ id: 'kid', createdAt: 9, data: { accounts: 'nope' } }];
  assert.throws(() => readBackup(JSON.stringify(file)), /damaged/);
});
