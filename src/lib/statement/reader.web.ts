import * as DocumentPicker from 'expo-document-picker';

import type { Fragment } from './types';

/** The browser preview reads spreadsheets and CSV only; PDFs are read on iPhone. */

export const canReadDocuments = false;

export type Picked =
  | { kind: 'table'; name: string; bytes: Uint8Array }
  | { kind: 'pdf'; name: string; uri: string }
  | { kind: 'unsupported'; name: string };

export async function pickFiles(): Promise<Picked[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true });
  if (result.canceled || !result.assets?.length) return null;
  const picked: Picked[] = [];
  for (const asset of result.assets) {
    const buffer = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x25 && bytes[1] === 0x50) picked.push({ kind: 'pdf', name: asset.name, uri: asset.uri });
    else if (/^image\//.test(asset.mimeType ?? '')) picked.push({ kind: 'unsupported', name: asset.name });
    else picked.push({ kind: 'table', name: asset.name, bytes });
  }
  return picked;
}

export async function pdfFragments(_uri: string): Promise<Fragment[]> {
  throw new Error('unsupported');
}

export type AiStatus = 'available' | 'off' | 'notReady' | 'unsupported';

export async function aiStatus(): Promise<AiStatus> {
  return 'unsupported';
}

export function aiAsk(_instructions: string, _prompt: string): Promise<string> {
  return Promise.reject(new Error('unsupported'));
}
