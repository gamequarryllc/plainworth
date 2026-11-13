import { Platform, TurboModuleRegistry } from 'react-native';
import {
  CloudStorage,
  CloudStorageErrorCode,
  CloudStorageProvider,
  CloudStorageScope,
} from 'react-native-cloud-storage';

import { CloudNotSetUp, type CloudFolder } from './engine';

/**
 * The folder in the person's own iCloud where their devices leave their copies.
 *
 * It's the app's private iCloud container (the part that doesn't show in the
 * Files app), under their Apple ID. Apple stores and moves the files; there is
 * no Plainworth server, and nobody but the person can read them.
 *
 * Needs a real build: Expo Go doesn't include iCloud, and Android has none.
 */
export const cloudSupported = Platform.OS === 'ios' && TurboModuleRegistry.get('CloudStorageICloudDrive') != null;

const FOLDER = 'sync';
const path = (name: string) => `${FOLDER}/${name}`;

let storage: CloudStorage | null = null;
function icloud(): CloudStorage {
  storage ??= new CloudStorage(CloudStorageProvider.ICloud, { scope: CloudStorageScope.AppData });
  return storage;
}

const codeOf = (e: unknown) => (!!e && typeof e === 'object' && 'code' in e ? e.code : undefined);

const missing = (e: unknown) =>
  codeOf(e) === CloudStorageErrorCode.FILE_NOT_FOUND || codeOf(e) === CloudStorageErrorCode.DIRECTORY_NOT_FOUND;

/**
 * Is the app's iCloud container there at all? Without it nothing can be read
 * or stored, however well iCloud itself is working. That happens when a build
 * is signed without the app's iCloud permission, and it must never be taken
 * for "nothing in iCloud yet".
 */
async function containerOpens(): Promise<boolean> {
  try {
    // Fails with "directory not found" only when the container itself can't be opened.
    await icloud().exists(FOLDER);
    return true;
  } catch (e) {
    if (codeOf(e) === CloudStorageErrorCode.DIRECTORY_NOT_FOUND) return false;
    throw e;
  }
}

let folderMade = false;

export const cloudFolder: CloudFolder = {
  async available() {
    if (!cloudSupported) return false;
    return icloud().isCloudAvailable();
  },

  async list() {
    let names: string[];
    try {
      names = await icloud().readdir(FOLDER);
    } catch (e) {
      if (!(await containerOpens())) throw new CloudNotSetUp();
      // Nothing has been synced yet, so there's no folder.
      if (missing(e) || !(await icloud().exists(FOLDER))) return [];
      throw e;
    }
    // A file that hasn't been downloaded yet can show up as ".name.json.icloud".
    const real = names.map((n) => (n.startsWith('.') && n.endsWith('.icloud') ? n.slice(1, -'.icloud'.length) : n));
    return [...new Set(real)];
  },

  async signature(name) {
    // Ask iCloud to fetch the newest version if another device has changed it.
    await icloud()
      .triggerSync(path(name))
      .catch(() => {});
    try {
      const stat = await icloud().stat(path(name));
      return `${stat.mtimeMs}:${stat.size}`;
    } catch {
      return null;
    }
  },

  async read(name) {
    try {
      return await icloud().readFile(path(name));
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  },

  async write(name, text) {
    if (!folderMade) {
      await icloud()
        .mkdir(FOLDER)
        .catch(() => {});
      folderMade = true;
    }
    try {
      await icloud().writeFile(path(name), text);
    } catch (e) {
      if (!(await containerOpens().catch(() => true))) throw new CloudNotSetUp();
      throw e;
    }
  },

  async remove(name) {
    try {
      await icloud().unlink(path(name));
    } catch (e) {
      if (!missing(e)) throw e;
    }
  },
};
