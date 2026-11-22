import { todayKey } from '@/lib/dates';
import { writeWidgets } from '@/lib/widget-storage';
import { widgetSnapshot } from '@/lib/widgets';

import { currentData, useStore } from './index';
import { useProStore } from './pro';
import { sampleData } from './sample';

/**
 * Keeps the home screen widgets in step with the app. Widgets are part of
 * Pro: with Pro they show your numbers, without it they show made-up ones
 * marked as a preview (your currency, name and Hide Amounts still apply).
 */

let last = '';
let timer: ReturnType<typeof setTimeout> | null = null;

function previewData() {
  const sample = sampleData();
  const year = new Date().getFullYear();
  const { currency } = currentData().settings;
  return {
    ...sample,
    settings: { ...sample.settings, currency, hideAmounts: false, goal: { amount: 1_000_000_00, age: 50 }, birthYear: year - 31 },
  };
}

/** Work out what the widgets show now and hand it over, if it changed. */
export function syncWidgets() {
  const pro = useProStore.getState().source != null;
  const json = JSON.stringify(widgetSnapshot(pro ? currentData() : previewData(), todayKey(), !pro));
  if (json === last) return;
  last = json;
  writeWidgets(json);
}

function soon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(syncWidgets, 800);
}

/** Called once at launch. */
export function startWidgets() {
  syncWidgets();
  useStore.subscribe(soon);
  useProStore.subscribe(soon);
}
