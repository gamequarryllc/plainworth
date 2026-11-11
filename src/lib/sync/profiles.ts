import { isProfileId, MAIN } from '@/lib/profiles';
import type { Data } from '@/lib/types';

import {
  createSync,
  STOP_FILE,
  type CloudCopy,
  type CloudFolder,
  type Sync,
  type SyncProblem,
  type SyncState,
  type SyncStatus,
} from './engine';
import { isEmpty } from './merge';

/**
 * Sync for every profile at once.
 *
 * Each profile syncs exactly as a single set of data does (engine.ts), with
 * its own files in the iCloud folder: "<profile>.<device>.json". On top of
 * that, each device keeps one small file, "profiles.<device>.json", listing
 * the profiles it has and the ones that were deleted, so adding or deleting a
 * profile on one device does the same on the others. A profile's name travels
 * inside its data, like any other setting.
 *
 * Like the engine, nothing here knows about iCloud or the app's store.
 */

/** A profile as the list file knows it. */
export interface ProfileRef {
  id: string;
  createdAt: number;
}

/** What a device remembers between launches, besides each profile's own sync state. */
export interface ProfilesState {
  on: boolean;
  deviceId: string;
  /** When this device turned sync on. */
  joinedAt: number;
  /** Profiles learned of from another device whose data hasn't arrived yet. */
  awaiting: string[];
  /** The list of profiles changed here and hasn't been sent yet. */
  dirty: boolean;
  lastSynced?: number;
  /** Sync was turned off and iCloud cleared from another device. */
  stoppedElsewhere?: boolean;
}

/** A device's list of profiles, as saved in iCloud. */
interface ListFile {
  app: 'Plainworth';
  format: number;
  device: string;
  savedAt: number;
  profiles: ProfileRef[];
  gone: Record<string, number>;
}

const LIST_FORMAT = 1;
const listName = (deviceId: string) => `profiles.${deviceId}.json`;
const isListName = (name: string) => name.startsWith('profiles.') && name.endsWith('.json');

export interface ProfilesSyncDeps {
  cloud: CloudFolder;
  dataVersion: number;
  /** The profiles on this device and the ones deleted from it. */
  profiles(): { list: ProfileRef[]; gone: Record<string, number> };
  /** Another device added this profile: make it here, empty, to be filled when its data arrives. */
  addProfile(profile: ProfileRef): void;
  /** Another device deleted this profile: delete it here too (or just remember it's gone, if it was never here). */
  removeProfile(id: string, at: number): void;
  getData(id: string): Data;
  /** Show this data in the app (if the profile is open) and save it. */
  setData(id: string, data: Data): void;
  readData(data: unknown, version: number): Data | null;
  /** Saved state: "all" for the device's own, "p.<id>" for each profile's. */
  loadState(key: string): unknown;
  saveState(key: string, state: unknown | null): void;
  keepReplaced(id: string, data: Data, from: 'device' | 'icloud'): void;
  onStatus(status: SyncStatus): void;
  now(): number;
  newId(): string;
}

/** A profile with data both here and in iCloud, when deciding what turning sync on should do. */
export interface BothHave {
  id: string;
  cloud: CloudCopy;
  local: Data;
}

export function createProfilesSync(deps: ProfilesSyncDeps) {
  let g: ProfilesState | null = readState(deps.loadState('all'));
  let busy = false;
  let problem: SyncProblem | undefined;
  let running: Promise<void> = Promise.resolve();
  /** The folder's file names while a sync is running, so each profile doesn't list the folder again. */
  let snapshot: string[] | null = null;
  const engines = new Map<string, Sync>();
  const lists = new Map<string, { signature: string | null; file: ListFile | null }>();

  function ensure(): ProfilesState {
    g ??= { on: false, deviceId: deps.newId(), joinedAt: 0, awaiting: [], dirty: false };
    return g;
  }

  function save() {
    deps.saveState('all', g);
  }

  function status(): SyncStatus {
    return {
      on: !!g?.on,
      busy,
      lastSynced: g?.lastSynced,
      problem: g?.on ? problem : undefined,
      stoppedElsewhere: g?.stoppedElsewhere,
    };
  }

  function publish() {
    deps.onStatus(status());
  }

  /** The part of the folder that belongs to one profile, as if it were a folder of its own. */
  function folderOf(id: string): CloudFolder {
    const prefix = `${id}.`;
    return {
      available: async () => (snapshot ? true : deps.cloud.available()),
      async list() {
        const names = snapshot ?? (await deps.cloud.list());
        return names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
      },
      signature: (name) => deps.cloud.signature(prefix + name),
      read: (name) => deps.cloud.read(prefix + name),
      async write(name, text) {
        await deps.cloud.write(prefix + name, text);
        if (snapshot && !snapshot.includes(prefix + name)) snapshot.push(prefix + name);
      },
      async remove(name) {
        await deps.cloud.remove(prefix + name);
        if (snapshot) snapshot = snapshot.filter((n) => n !== prefix + name);
      },
    };
  }

  function engine(id: string): Sync {
    let e = engines.get(id);
    if (e) return e;
    e = createSync({
      cloud: folderOf(id),
      dataVersion: deps.dataVersion,
      getData: () => deps.getData(id),
      setData: (data) => deps.setData(id, data),
      readData: deps.readData,
      loadState: () => readEngineState(deps.loadState(`p.${id}`)),
      saveState: (state) => deps.saveState(`p.${id}`, state),
      keepReplaced: (data, from) => deps.keepReplaced(id, data, from),
      onStatus: () => {},
      now: deps.now,
      newId: deps.newId,
      deviceId: () => ensure().deviceId,
    });
    engines.set(id, e);
    return e;
  }

  /** Stop syncing one profile on this device and take this device's copy of it out of iCloud. */
  async function drop(id: string) {
    await engine(id).disable(false);
    engines.delete(id);
    deps.saveState(`p.${id}`, null);
    if (!g) return;
    g.awaiting = g.awaiting.filter((x) => x !== id);
    await deps.cloud.remove(`${id}.${g.deviceId}.json`).catch(() => {});
  }

  async function stoppedAt(names: string[]): Promise<number | null> {
    if (!names.includes(STOP_FILE)) return null;
    try {
      const at = JSON.parse((await deps.cloud.read(STOP_FILE)) ?? '{}').at;
      return typeof at === 'number' ? at : null;
    } catch {
      return null;
    }
  }

  /** The other devices' lists of profiles. */
  async function readLists(names: string[]): Promise<ListFile[]> {
    const mine = g ? listName(g.deviceId) : null;
    const others = names.filter((n) => isListName(n) && n !== mine);
    for (const name of [...lists.keys()]) if (!others.includes(name)) lists.delete(name);
    const out: ListFile[] = [];
    for (const name of others) {
      const signature = await deps.cloud.signature(name).catch(() => null);
      let known = lists.get(name);
      if (!known || signature === null || known.signature !== signature) {
        const text = await deps.cloud.read(name);
        if (text == null) continue;
        known = { signature, file: parseList(text) };
        lists.set(name, known);
      }
      if (known.file) out.push(known.file);
    }
    return out;
  }

  /** Bring the other devices' added and deleted profiles to this one. */
  async function applyLists(files: ListFile[]) {
    if (!g) return;
    const gone = new Map<string, number>();
    for (const f of files) {
      for (const [id, at] of Object.entries(f.gone)) if (at > (gone.get(id) ?? -Infinity)) gone.set(id, at);
    }
    const mine = deps.profiles();
    const live = new Set(mine.list.map((p) => p.id));
    for (const [id, at] of gone) {
      if (live.has(id)) {
        await drop(id);
        live.delete(id);
      } else if (mine.gone[id] !== undefined) continue;
      deps.removeProfile(id, at);
      g.dirty = true;
    }
    for (const f of files) {
      for (const p of f.profiles) {
        if (live.has(p.id) || gone.has(p.id) || mine.gone[p.id] !== undefined) continue;
        live.add(p.id);
        // Its data began on another device, so this one waits for it instead of starting its own.
        g.awaiting.push(p.id);
        deps.addProfile(p);
        g.dirty = true;
      }
    }
  }

  function listText(s: ProfilesState): string {
    const mine = deps.profiles();
    const file: ListFile = {
      app: 'Plainworth',
      format: LIST_FORMAT,
      device: s.deviceId,
      savedAt: deps.now(),
      profiles: mine.list.map((p) => ({ id: p.id, createdAt: p.createdAt })),
      gone: mine.gone,
    };
    return JSON.stringify(file);
  }

  /** Everyone's data was deleted from iCloud on another device: keep what's here, and stop. */
  async function stopHere(names: string[]) {
    if (!g) return;
    for (const p of deps.profiles().list) await engine(p.id).disable(false);
    const deviceId = g.deviceId;
    g = { ...g, on: false, stoppedElsewhere: true, awaiting: [], dirty: false };
    save();
    // In case this device wrote its files again after the others were deleted.
    for (const name of names) {
      if (name !== STOP_FILE && name.endsWith(`.${deviceId}.json`)) await deps.cloud.remove(name).catch(() => {});
    }
  }

  async function cycle(): Promise<void> {
    if (!g?.on) return;
    if (!(await deps.cloud.available())) {
      problem = 'no-icloud';
      return;
    }
    const names = await deps.cloud.list();
    const stopped = await stoppedAt(names);
    if (!g?.on) return;
    if (stopped != null && stopped > g.joinedAt) {
      await stopHere(names);
      return;
    }

    snapshot = [...names];
    let worst: SyncProblem | undefined;
    try {
      await applyLists(await readLists(names));
      for (const p of deps.profiles().list) {
        if (!g?.on) return;
        const e = engine(p.id);
        if (e.status().on) await e.sync();
        else if (!g.awaiting.includes(p.id)) await e.enable('device');
        else if (await e.join()) g.awaiting = g.awaiting.filter((x) => x !== p.id);
        const trouble = e.status().problem;
        if (trouble && worst !== 'update-needed') worst = trouble;
      }
      if (!g?.on) return;
      // After the profiles' own files, so a device that reads the list finds the data it names.
      const mine = listName(g.deviceId);
      if (g.dirty || !names.includes(mine)) {
        const text = listText(g);
        g.dirty = false;
        save();
        try {
          await deps.cloud.write(mine, text);
        } catch (e) {
          if (g) g.dirty = true;
          save();
          throw e;
        }
      }
    } finally {
      snapshot = null;
    }
    if (g?.on) {
      const now = deps.now();
      const stale = now - (g.lastSynced ?? 0) > 60_000;
      g.lastSynced = now;
      if (stale) save();
    }
    problem = worst;
  }

  /** Sync once. Calls made while one is running wait their turn. */
  function sync(): Promise<void> {
    running = running.then(async () => {
      if (!g?.on) return;
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

  /** Before turning sync on: is iCloud reachable, and which profiles have data both here and there? */
  async function look(): Promise<{ available: boolean; both: BothHave[] }> {
    if (!(await deps.cloud.available())) return { available: false, both: [] };
    const both: BothHave[] = [];
    for (const p of deps.profiles().list) {
      const local = deps.getData(p.id);
      if (isEmpty(local)) continue;
      const seen = await engine(p.id).look();
      if (seen.cloud) both.push({ id: p.id, cloud: seen.cloud, local });
    }
    return { available: true, both };
  }

  /**
   * Turn sync on. Profiles that only this device or only iCloud has are simply
   * kept. `keep` settles the ones with data in both: "device" replaces what's
   * in iCloud, "icloud" replaces what's on this device.
   */
  async function enable(keep: 'device' | 'icloud'): Promise<void> {
    await running;
    const before = g ? { ...g } : null;
    try {
      const names = await deps.cloud.list();
      // After any earlier "delete from iCloud", even if that device's clock runs ahead of this one's.
      const now = Math.max(deps.now(), ((await stoppedAt(names)) ?? 0) + 1);
      g = { ...ensure(), on: true, joinedAt: now, awaiting: [], dirty: true, stoppedElsewhere: false };
      await applyLists(await readLists(names));
      for (const p of deps.profiles().list) {
        if (g.awaiting.includes(p.id)) continue;
        const e = engine(p.id);
        const seen = await e.look();
        await e.enable(seen.cloud ? (isEmpty(deps.getData(p.id)) ? 'icloud' : keep) : 'device');
      }
    } catch (e) {
      g = before;
      throw e;
    }
    problem = undefined;
    save();
    publish();
    await sync();
  }

  /**
   * Turn sync off on this device; its data stays. With `deleteCloud`, also
   * remove every device's copy from iCloud and leave a note so the other
   * devices stop too, keeping what they have.
   */
  async function disable(deleteCloud: boolean): Promise<void> {
    await running;
    let clock = Math.max(deps.now(), (g?.joinedAt ?? 0) + 1);
    for (const p of deps.profiles().list) {
      const e = engine(p.id);
      clock = Math.max(clock, e.clock() + 1);
      await e.disable(false);
    }
    g = { ...ensure(), on: false, joinedAt: 0, awaiting: [], dirty: false };
    problem = undefined;
    lists.clear();
    save();
    publish();
    if (!deleteCloud) return;
    const names = await deps.cloud.list();
    await deps.cloud.write(STOP_FILE, JSON.stringify({ at: clock }));
    for (const name of names) {
      if (name.endsWith('.json') && name !== STOP_FILE) await deps.cloud.remove(name).catch(() => {});
    }
  }

  /** A profile's data changed on this device. Returns true if that's something to sync. */
  function localChange(id: string, prev: Data, next: Data): boolean {
    return !!g?.on && engine(id).localChange(prev, next);
  }

  /** Everything in a profile was just replaced on this device (a backup restored, or its data erased). */
  function localReplace(id: string): boolean {
    return !!g?.on && engine(id).localReplace();
  }

  /** A profile was added on this device. Its data goes up on the next sync, and then the list does. */
  function profileAdded(): boolean {
    if (!g?.on) return false;
    g.dirty = true;
    save();
    return true;
  }

  /** A profile was deleted on this device. */
  function profileRemoved(id: string): boolean {
    if (!g?.on) {
      engines.delete(id);
      deps.saveState(`p.${id}`, null);
      return false;
    }
    g.dirty = true;
    save();
    running = running.then(() => drop(id)).catch((e) => console.warn('Could not stop syncing a deleted profile', e));
    return true;
  }

  function dismissStopped() {
    if (!g?.stoppedElsewhere) return;
    g = { ...g, stoppedElsewhere: false };
    save();
    publish();
  }

  return { status, sync, look, enable, disable, localChange, localReplace, profileAdded, profileRemoved, dismissStopped };
}

export type ProfilesSync = ReturnType<typeof createProfilesSync>;

function readState(raw: unknown): ProfilesState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<ProfilesState>;
  if (typeof s.deviceId !== 'string' || !s.deviceId) return null;
  return {
    on: s.on === true,
    deviceId: s.deviceId,
    joinedAt: typeof s.joinedAt === 'number' ? s.joinedAt : 0,
    awaiting: Array.isArray(s.awaiting) ? s.awaiting.filter(isProfileId) : [],
    dirty: s.dirty === true,
    lastSynced: typeof s.lastSynced === 'number' ? s.lastSynced : undefined,
    stoppedElsewhere: s.stoppedElsewhere === true,
  };
}

function readEngineState(raw: unknown): SyncState | null {
  const s = raw as Partial<SyncState> | null;
  return s && typeof s === 'object' && typeof s.deviceId === 'string' && typeof s.epoch?.id === 'string'
    ? (s as SyncState)
    : null;
}

function parseList(text: string): ListFile | null {
  let raw: Partial<ListFile> | null = null;
  try {
    raw = JSON.parse(text);
  } catch {
    // A half-written file is skipped until it's whole.
  }
  // A list from a newer Plainworth is skipped too: the profiles' own files say when an update is needed.
  if (!raw || raw.app !== 'Plainworth' || typeof raw.format !== 'number' || raw.format > LIST_FORMAT) return null;
  const profiles: ProfileRef[] = [];
  for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
    if (p && isProfileId(p.id)) profiles.push({ id: p.id, createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0 });
  }
  const gone: Record<string, number> = {};
  if (raw.gone && typeof raw.gone === 'object') {
    for (const [id, at] of Object.entries(raw.gone)) {
      // The first profile can't be deleted, whatever a file says.
      if (isProfileId(id) && id !== MAIN && typeof at === 'number' && Number.isFinite(at)) gone[id] = at;
    }
  }
  return {
    app: 'Plainworth',
    format: raw.format,
    device: String(raw.device ?? ''),
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    profiles,
    gone,
  };
}
