// MOCKUPS ONLY. Never merge. Picks a mockup from the web address, e.g. /insights?v=a&pro=1
import { useStore } from '@/store';
import { setTestPro } from '@/store/pro';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
/** Pro card look: '' (today), a, b, c. */
export const V = q?.get('v') ?? '';
/** Free preview look: '' (today), sample, blur, titles. */
export const F = q?.get('f') ?? '';
if (q?.get('pro')) setTimeout(() => setTestPro(q.get('pro') === '1'), 300);
if (q?.get('seed')) setTimeout(() => useStore.getState().loadSampleData(Number(q.get('seed'))), 1500);
/** Spending filter look: '' (today), menu, links, icon. */
export const R = q?.get('r') ?? '';
import { LogBox } from 'react-native';
LogBox.ignoreAllLogs();
/** Which tab opens. */
export const P = q?.get('p') ?? 'spending';
/** Move Where It Went and Income off the Spending tab. */
export const M = q?.get('m') ?? '';
