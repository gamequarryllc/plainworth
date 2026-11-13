import * as DocumentPicker from 'expo-document-picker';

import type { Fragment } from './types';

/** The browser preview reads spreadsheets and CSV only; PDFs and photos are read on iPhone. */

export const canReadDocuments = false;

export type Picked =
  | { kind: 'table'; name: string; bytes: Uint8Array }
  | { kind: 'pdf'; name: string; uri: string }
  | { kind: 'images'; name: string; uris: string[] }
  | { kind: 'unsupported'; name: string };

export async function pickFile(): Promise<Picked | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const buffer = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x25 && bytes[1] === 0x50) return { kind: 'pdf', name: asset.name, uri: asset.uri };
  if (/^image\//.test(asset.mimeType ?? '')) return { kind: 'images', name: asset.name, uris: [asset.uri] };
  return { kind: 'table', name: asset.name, bytes };
}

export async function pickPhotos(): Promise<Picked | null> {
  return null;
}

export async function pdfFragments(_uri: string): Promise<Fragment[]> {
  throw new Error('unsupported');
}

export async function imageFragments(_uris: string[], _onProgress?: (done: number, of: number) => void): Promise<Fragment[]> {
  throw new Error('unsupported');
}

export type AiStatus = 'available' | 'off' | 'notReady' | 'unsupported';

export async function aiStatus(): Promise<AiStatus> {
  return 'unsupported';
}

export function aiAsk(_instructions: string, _prompt: string): Promise<string> {
  return Promise.reject(new Error('unsupported'));
}
