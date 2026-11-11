import type { Data } from '@/lib/types';

import {
  adopt,
  isEmpty,
  latestStamp,
  merge,
  newerEpoch,
  newMeta,
  stampChanges,
  syncedPart,
  type Epoch,
  type Replica,
  type SyncMeta,
} from './merge';

/**
 * Sync between a person's own devices through a folder in their private iCloud.
 *
 * Each device keeps one file there holding its whole copy of the data, and
 * only ever writes its own file. To sync, a device reads the other devices'
 * files, merges them into its copy (see merge.ts), and writes its file again
 * if anything is new. Because no two devices write the same file, they can't
 * overwrite each other, and a device that was offline simply catches up the
 * next time it reads.
 *
 * This file has no iCloud or React Native code in it: the folder, the app's
 * data and the saved state are passed in, so two "devices" can be run against
 * one pretend folder in tests.
 */

/** The folder in iCloud, as the engine needs it. */
export interface CloudFolder {
  /** Signed in to iCloud with iCloud Drive on. */
  available(): Promise<boolean>;
  /** File names in the folder; empty if there's no folder yet. */
  list(): Promise<string[]>;
  /** Something that changes whenever the file's contents do (its date and size), or null if it can't be told. */
  signature(name: string): Promise<string | null>;
  /** The file's text, or null if it isn't there. */
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** What a device remembers between launches. */
export interface SyncState extends SyncMeta {
  on: boolean;
  deviceId: string;
  /** When this device turned sync on. */
  joinedAt: number;
  /** The latest change time this device has made or seen, so its own changes always come after. */
  clock: number;
  /** This device has changes its iCloud file doesn't have yet. */
  dirty: boolean;
  lastSynced?: number;
  /** Sync was turned off and iCloud cleared from another device. */
  stoppedElsewhere?: boolean;
}

export type SyncProblem =
  /** Not signed in to iCloud, or iCloud Drive is off. */
  | 'no-icloud'
  /** Another device runs a newer Plainworth whose data this version can't read. */
  | 'update-needed'
  | 'error';

export interface SyncStatus {
  on: boolean;
  busy: boolean;
  lastSynced?: number;
  problem?: SyncProblem;
  stoppedElsewhere?: boolean;
}

/** One device's file in the iCloud folder. */
export interface CloudFile {
  app: 'Plainworth';
  /** Version of this file's layout. */
  format: number;
  /** Version of `data`'s layout (the same number backups carry). */
  dataVersion: number;
  device: string;
  savedAt: number;
  epoch: Epoch;
  stamps: Record<string, number>;
  tombs: Record<string, number>;
  data: Data;
}

export const FILE_FORMAT = 1;
/** Left behind when someone deletes their data from iCloud, so their other devices stop instead of putting it back. */
export const STOP_FILE = 'stopped.json';

/** What's in iCloud, when deciding what turning sync on should do. */
export interface CloudCopy {
  data: Data;
  /** When it last changed. */
  changedAt: number;
}

export interface SyncDeps {
  cloud: CloudFolder;
  dataVersion: number;
  /** The app's data right now. */
  getData(): Data;
  /** Show this data in the app and save it. */
  setData(data: Data): void;
  /** Bring another version's data up to date and check it, or null if it can't be used. */
  readData(data: unknown, version: number): Data | null;
  loadState(): SyncState | null;
  saveState(state: SyncState | null): void;
  /** Keep a copy of data that's about to be replaced, in case it was the wrong choice. */
  keepReplaced(data: Data, from: 'device' | 'icloud'): void;
  onStatus(status: SyncStatus): void;
  now(): number;
  newId(): string;
  /** This device's id, when something outside decides it (each profile's sync on one device shares one). */
  deviceId?(): string;
}

interface OtherFile {
  signature: string | null;
  file: CloudFile | null;
  /** Written by a newer Plainworth than this one. */
  tooNew: boolean;
}

export function createSync(deps: SyncDeps) {
  let state: SyncState | null = deps.loadState();
  let busy = false;
  let problem: SyncProblem | undefined;
  /** True while the engine itself is changing the app's data, so that isn't taken for a change made here. */
  let applying = false;
  let running: Promise<void> = Promise.resolve();
  const seen = new Map<string, OtherFile>();

  const fileName = (deviceId: string) => `${deviceId}.json`;
  const myId = (): string | null => state?.deviceId ?? deps.deviceId?.() ?? null;

  function status(): SyncStatus {
    return {
      on: !!state?.on,
      busy,
      lastSynced: state?.lastSynced,
      problem: state?.on ? problem : undefined,
      stoppedElsewhere: state?.stoppedElsewhere,
    };
  }

  function publish() {
    deps.onStatus(status());
  }

  function save() {
    deps.saveState(state);
  }

  /** A time after everything this device has made or seen, even if its clock is behind another device's. */
  function tick(): number {
    const now = Math.max(deps.now(), (state?.clock ?? 0) + 1);
    if (state) state.clock = now;
    return now;
  }

  function show(data: Data) {
    applying = true;
    try {
      deps.setData(data);
    } finally {
      applying = false;
    }
  }

  function parse(text: string): { file: CloudFile | null; tooNew: boolean } {
    let raw: Partial<CloudFile> | null = null;
    try {
      raw = JSON.parse(text);
    } catch {
      // Handled below: a file that's half-written or damaged is skipped until it's whole.
    }
    if (!raw || raw.app !== 'Plainworth' || typeof raw.format !== 'number' || typeof raw.dataVersion !== 'number') {
      return { file: null, tooNew: false };
    }
    if (raw.format > FILE_FORMAT || raw.dataVersion > deps.dataVersion) return { file: null, tooNew: true };
    const epoch = raw.epoch;
    if (!epoch || typeof epoch.id !== 'string' || typeof epoch.at !== 'number') return { file: null, tooNew: false };
    const data = deps.readData(raw.data, raw.dataVersion);
    if (!data) return { file: null, tooNew: false };
    return {
      file: {
        app: 'Plainworth',
        format: raw.format,
        dataVersion: deps.dataVersion,
        device: String(raw.device ?? ''),
        savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
        epoch,
        stamps: times(raw.stamps),
        tombs: times(raw.tombs),
        data,
      },
      tooNew: false,
    };
  }

  /** Read the other devices' files, skipping ones that haven't changed since last time. */
  async function readOthers(names: string[], mine: string | null): Promise<OtherFile[]> {
    const others = names.filter((n) => n.endsWith('.json') && n !== STOP_FILE && n !== mine);
    for (const name of [...seen.keys()]) if (!others.includes(name)) seen.delete(name);
    const out: OtherFile[] = [];
    for (const name of others) {
      const signature = await deps.cloud.signature(name).catch(() => null);
      const known = seen.get(name);
      if (known && signature !== null && known.signature === signature) {
        out.push(known);
        continue;
      }
      const text = await deps.cloud.read(name);
      if (text == null) continue;
      const entry: OtherFile = { signature, ...parse(text) };
      seen.set(name, entry);
      out.push(entry);
    }
    return out;
  }

  /** The newest line of history among `files`, with every device's copy of it merged into one. */
  function newest(files: CloudFile[]): Replica | null {
    let epoch: Epoch | null = null;
    for (const f of files) if (!epoch || newerEpoch(f.epoch, epoch)) epoch = f.epoch;
    if (!epoch) return null;
    let replica: Replica | null = null;
    for (const f of files) {
      if (f.epoch.id !== epoch.id) continue;
      const next: Replica = { data: f.data, meta: { epoch: f.epoch, stamps: f.stamps, tombs: f.tombs } };
      replica = replica ? merge(replica, next) : next;
    }
    return replica;
  }

  /** When the iCloud folder was cleared from another device, if that happened after this device joined. */
  async function stoppedAt(names: string[]): Promise<number | null> {
    if (!names.includes(STOP_FILE)) return null;
    try {
      const at = JSON.parse((await deps.cloud.read(STOP_FILE)) ?? '{}').at;
      return typeof at === 'number' ? at : null;
    } catch {
      return null;
    }
  }

  function fileText(s: SyncState): string {
    const file: CloudFile = {
      app: 'Plainworth',
      format: FILE_FORMAT,
      dataVersion: deps.dataVersion,
      device: s.deviceId,
      savedAt: deps.now(),
      epoch: s.epoch,
      stamps: s.stamps,
      tombs: s.tombs,
      data: syncedPart(deps.getData()),
    };
    return JSON.stringify(file);
  }

  async function cycle(): Promise<void> {
    if (!state?.on) return;
    if (!(await deps.cloud.available())) {
      problem = 'no-icloud';
      return;
    }
    const mine = fileName(state.deviceId);
    const names = await deps.cloud.list();

    const stopped = await stoppedAt(names);
    if (!state?.on) return;
    if (stopped != null && stopped > state.joinedAt) {
      // Their data was deleted from iCloud on another device. Keep what's here, and stop.
      state = { ...state, on: false, stoppedElsewhere: true, stamps: {}, tombs: {}, dirty: false };
      save();
      // In case this device wrote its file again after the others were deleted.
      if (names.includes(mine)) await deps.cloud.remove(mine).catch(() => {});
      return;
    }

    const others = await readOthers(names, mine);
    // Everything above waited on iCloud; from here to the write nothing waits,
    // so a change made in the app meanwhile can't slip between merge and save.
    if (!state?.on) return;
    if (others.some((o) => o.tooNew)) {
      problem = 'update-needed';
      return;
    }
    const files = others.map((o) => o.file).filter((f): f is CloudFile => f != null);
    const latest = newest(files);

    if (latest && newerEpoch(latest.meta.epoch, state.epoch) && latest.meta.epoch.id !== state.epoch.id) {
      // Another device replaced everything (restored a backup, erased, or chose its data): take it whole.
      const before = deps.getData();
      if (!isEmpty(before)) deps.keepReplaced(before, 'device');
      state = {
        ...state,
        epoch: latest.meta.epoch,
        stamps: latest.meta.stamps,
        tombs: latest.meta.tombs,
        clock: Math.max(state.clock, latestStamp(latest.meta)),
        dirty: true,
      };
      show(adopt(before, latest.data));
    } else {
      let local: Replica = {
        data: deps.getData(),
        meta: { epoch: state.epoch, stamps: state.stamps, tombs: state.tombs },
      };
      let changed = false;
      for (const f of files) {
        if (f.epoch.id !== state.epoch.id) continue;
        const result = merge(local, { data: f.data, meta: { epoch: f.epoch, stamps: f.stamps, tombs: f.tombs } });
        if (result.changed) {
          local = result;
          changed = true;
        }
      }
      if (changed) {
        state = {
          ...state,
          stamps: local.meta.stamps,
          tombs: local.meta.tombs,
          clock: Math.max(state.clock, latestStamp(local.meta)),
          dirty: true,
        };
        show(local.data);
      }
    }

    if (state.dirty || !names.includes(mine)) {
      const text = fileText(state);
      state.dirty = false;
      save();
      try {
        await deps.cloud.write(mine, text);
      } catch (e) {
        if (state) state.dirty = true;
        save();
        throw e;
      }
    }
    if (state?.on) {
      // Only for the "Synced 2 min ago" line, so it isn't worth saving on every check.
      const now = deps.now();
      const stale = now - (state.lastSynced ?? 0) > 60_000;
      state.lastSynced = now;
      if (stale) save();
    }
    problem = undefined;
  }

  /** Sync once. Calls made while one is running wait their turn. */
  function sync(): Promise<void> {
    running = running.then(async () => {
      if (!state?.on) return;
      busy = true;
      publish();
      try {
        await cycle();
      } catch (e) {
        console.warn('Sync failed', e);
        problem = 'error';
      } finally {
        busy = false;
        publish();
      }
    });
    return running;
  }

  /** Before turning sync on: is iCloud reachable, and is there data in it already? */
  async function look(): Promise<{ available: boolean; cloud: CloudCopy | null }> {
    if (!(await deps.cloud.available())) return { available: false, cloud: null };
    const names = await deps.cloud.list();
    // This device's own file from an earlier time sync was on doesn't count as data in iCloud.
    const mine = myId();
    const others = await readOthers(names, mine ? fileName(mine) : null);
    const latest = newest(others.map((o) => o.file).filter((f): f is CloudFile => f != null));
    if (!latest || isEmpty(latest.data)) return { available: true, cloud: null };
    return { available: true, cloud: { data: latest.data, changedAt: latestStamp(latest.meta) } };
  }

  /**
   * Turn sync on. `keep` says whose data wins when both this device and iCloud
   * have some: "device" replaces what's in iCloud (other devices then take this
   * device's data), "icloud" replaces what's on this device.
   */
  async function enable(keep: 'device' | 'icloud'): Promise<void> {
    await running;
    const names = await deps.cloud.list();
    const deviceId = myId() ?? deps.newId();
    const others = await readOthers(names, fileName(deviceId));
    const latest = newest(others.map((o) => o.file).filter((f): f is CloudFile => f != null));
    // After any earlier "delete from iCloud", even if that device's clock runs ahead of this one's.
    const now = Math.max(deps.now(), ((await stoppedAt(names)) ?? 0) + 1);
    const local = deps.getData();

    if (latest && keep === 'icloud') {
      if (!isEmpty(local)) deps.keepReplaced(local, 'device');
      state = {
        on: true,
        deviceId,
        joinedAt: now,
        epoch: latest.meta.epoch,
        stamps: latest.meta.stamps,
        tombs: latest.meta.tombs,
        clock: Math.max(now, latestStamp(latest.meta)),
        dirty: true,
      };
      show(adopt(local, latest.data));
    } else {
      if (latest && !isEmpty(latest.data)) deps.keepReplaced(adopt(local, latest.data), 'icloud');
      // A new line of history that's newer than anything in iCloud, so other devices take it.
      // Unless there's nothing here: an empty device must never replace anyone's data, even
      // when iCloud hasn't delivered another device's file yet and so looks empty too. Its
      // line of history is the oldest there can be, and it takes the first real one it sees.
      const at = isEmpty(local) ? 0 : Math.max(now, (latest ? latestStamp(latest.meta) : 0) + 1, (state?.clock ?? 0) + 1);
      state = {
        on: true,
        deviceId,
        joinedAt: now,
        ...newMeta({ id: deps.newId(), at }),
        clock: Math.max(at, state?.clock ?? 0),
        dirty: true,
      };
    }
    problem = undefined;
    save();
    publish();
    await sync();
  }

  /**
   * Turn sync on only by taking what's already in iCloud. False, with nothing
   * changed, if no other device's copy is there yet. For data that began on
   * another device: this one must wait for it, not start its own.
   */
  async function join(): Promise<boolean> {
    await running;
    const names = await deps.cloud.list();
    const mine = myId();
    const others = await readOthers(names, mine ? fileName(mine) : null);
    if (!others.some((o) => o.file != null)) return false;
    await enable('icloud');
    return true;
  }

  /**
   * Turn sync off on this device; its data stays. With `deleteCloud`, also
   * remove every device's copy from iCloud and leave a note so the other
   * devices stop too, keeping what they have.
   */
  async function disable(deleteCloud: boolean): Promise<void> {
    await running;
    const deviceId = myId() ?? deps.newId();
    const epoch = state?.epoch ?? { id: deps.newId(), at: deps.now() };
    const clock = state?.clock ?? deps.now();
    state = { on: false, deviceId, joinedAt: 0, epoch, stamps: {}, tombs: {}, clock, dirty: false };
    problem = undefined;
    seen.clear();
    save();
    publish();
    if (!deleteCloud) return;
    const names = await deps.cloud.list();
    await deps.cloud.write(STOP_FILE, JSON.stringify({ at: Math.max(deps.now(), clock + 1) }));
    for (const name of names) {
      if (name.endsWith('.json') && name !== STOP_FILE) await deps.cloud.remove(name).catch(() => {});
    }
  }

  /** The app's data changed. Returns true if that's something to sync. */
  function localChange(prev: Data, next: Data): boolean {
    if (applying || !state?.on) return false;
    const meta = stampChanges(prev, next, state, tick());
    if (!meta) return false;
    state = { ...state, stamps: meta.stamps, tombs: meta.tombs, dirty: true };
    save();
    return true;
  }

  /**
   * Everything on this device was just replaced (a backup restored, or all
   * data erased). That starts a new line of history, which the other devices
   * take whole instead of merging their old data back in.
   */
  function localReplace(): boolean {
    if (applying || !state?.on) return false;
    const at = tick();
    state = { ...state, ...newMeta({ id: deps.newId(), at }), dirty: true };
    save();
    return true;
  }

  function dismissStopped() {
    if (!state?.stoppedElsewhere) return;
    state = { ...state, stoppedElsewhere: false };
    save();
    publish();
  }

  /** The latest change time this device has made or seen. */
  const clock = () => state?.clock ?? 0;

  return { status, sync, look, enable, join, disable, localChange, localReplace, dismissStopped, clock };
}

export type Sync = ReturnType<typeof createSync>;

function times(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}
