import type { CloudFolder } from './engine';

/**
 * The browser preview has no iCloud, so sync isn't offered there.
 *
 * The one exception is for testing: a browser test can put a pretend folder on
 * the page before the app loads, to run two copies of the app against it.
 */
const pretend = (globalThis as { __plainworthTestCloud?: CloudFolder }).__plainworthTestCloud;

export const cloudSupported = pretend != null;

export const cloudFolder: CloudFolder = pretend ?? {
  available: async () => false,
  list: async () => [],
  signature: async () => null,
  read: async () => null,
  write: async () => {},
  remove: async () => {},
};
