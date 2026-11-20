import { cleanName } from '@/lib/name';
import { MAIN } from '@/lib/profiles';
import type { Data } from '@/lib/types';

import { defaultSettings, emptyData } from './defaults';
import { useStore } from './index';
import { useProfiles } from './profile-list';
import { setTestFree } from './pro';
import { addProfile, canAddProfile, deleteProfile, switchProfile } from './profiles';
import { resetReminderOffer } from './reminder-offer';
import { sampleData } from './sample';
import { resetSample } from './sample-hidden';
import { DECADE, decadeSampleData } from './sample-decade';

/**
 * TestFlight only: made-up histories, to try Plainworth as someone who has
 * used it for 3 months, 3 years or 10 years (the projections and yearly
 * comparisons need months of balances a tester doesn't have yet).
 *
 * "New Pro User" is the day someone installs Plainworth and buys Pro right
 * away: nothing entered, the first-open sample showing, Pro on.
 *
 * Each one opens in a profile of its own, so the tester's real numbers are
 * never touched. Loading the same one again starts it fresh.
 */
export const TEST_SETS = [
  { label: 'New Pro User', name: 'Test New User', months: 0 },
  { label: '3 Months', name: 'Test 3 Months', months: 3 },
  { label: '3 Years', name: 'Test 3 Years', months: 36 },
  { label: '10 Years', name: 'Test 10 Years', months: DECADE },
] as const;

/** Open a test set in its own profile. Returns its name, or null when there's no room for another profile. */
export function loadTestProfile(index: number): string | null {
  const set = TEST_SETS[index];
  if (!set) return null;
  const old = useProfiles.getState().list.find((p) => p.id !== MAIN && cleanName(p.name) === set.name);
  if (!old && !canAddProfile()) return null;
  const made = set.months === 0 ? emptyData() : set.months === DECADE ? decadeSampleData() : sampleData(set.months);
  const data: Data = {
    ...made,
    settings: { ...defaultSettings(), currency: useStore.getState().settings.currency, name: set.name },
  };
  switchProfile(addProfile({ name: set.name, data }));
  // The one loaded before, now that it isn't the open profile.
  if (old) deleteProfile(old.id);
  if (set.months === 0) {
    // As on a fresh install: the sample previews, the reminder offer still to come, and Pro.
    resetSample();
    resetReminderOffer();
    setTestFree(false);
  }
  return set.name;
}
