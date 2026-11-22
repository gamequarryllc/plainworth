import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';

/** The shared space on the phone that both the app and its widgets can read. Matches app.json and targets/widgets. */
export const APP_GROUP = 'group.com.gamequarry.plainworth';
const KEY = 'snapshot';

const shared = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;

/** Hand the widgets what to draw, and have them redraw. */
export function writeWidgets(json: string) {
  if (!shared) return;
  try {
    shared.set(KEY, json);
    ExtensionStorage.reloadWidget();
  } catch {
    // Widgets are a nicety: never let them get in the app's way.
  }
}
