import { requireOptionalNativeModule } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { Fragment } from './types';

/**
 * Picking a statement and reading its text, all on the phone. PDFs are read
 * with PDFKit and pictures with Apple's text recognition (the StatementReader
 * module in /modules). Nothing here uses the network.
 */

interface NativeReader {
  readPdf(uri: string): Promise<string>;
  readImage(uri: string, page: number): Promise<string>;
  aiStatus(): Promise<string>;
  aiAsk(instructions: string, prompt: string): Promise<string>;
}

const native = requireOptionalNativeModule<NativeReader>('StatementReader');

/** PDFs and photos need the iPhone's own readers. */
export const canReadDocuments = native != null;

export type Picked =
  | { kind: 'table'; name: string; bytes: Uint8Array }
  | { kind: 'pdf'; name: string; uri: string }
  | { kind: 'images'; name: string; uris: string[] }
  | { kind: 'unsupported'; name: string };

const starts = (bytes: Uint8Array, ...sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Choose a file from Files, iCloud Drive and so on. Null if they cancel. */
export async function pickFile(): Promise<Picked | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name = asset.name ?? 'File';
  if (/^image\//.test(asset.mimeType ?? '') || /\.(png|jpe?g|heic|heif|webp|tiff?|bmp|gif)$/i.test(name)) {
    return { kind: 'images', name, uris: [asset.uri] };
  }
  const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
  if (starts(bytes, 0x25, 0x50, 0x44, 0x46)) return { kind: 'pdf', name, uri: asset.uri };
  // The old .xls format (not .xlsx) and Numbers files can't be read.
  if (starts(bytes, 0xd0, 0xcf, 0x11, 0xe0) || /\.(numbers|docx?|pages)$/i.test(name)) return { kind: 'unsupported', name };
  return { kind: 'table', name, bytes };
}

/** Choose photos or screenshots. The system picker hands over only what's chosen, so no photo access is asked for. */
export async function pickPhotos(): Promise<Picked | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 12,
    orderedSelection: true,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const uris = result.assets.map((a) => a.uri);
  return { kind: 'images', name: uris.length === 1 ? 'Photo' : `${uris.length} photos`, uris };
}

function parse(json: string): Fragment[] {
  const list = JSON.parse(json);
  return Array.isArray(list) ? (list as Fragment[]) : [];
}

export async function pdfFragments(uri: string): Promise<Fragment[]> {
  if (!native) throw new Error('unsupported');
  return parse(await native.readPdf(uri));
}

/** Each picture counts as a page, in the order chosen. */
export async function imageFragments(uris: string[], onProgress?: (done: number, of: number) => void): Promise<Fragment[]> {
  if (!native) throw new Error('unsupported');
  const out: Fragment[] = [];
  for (let i = 0; i < uris.length; i++) {
    onProgress?.(i, uris.length);
    out.push(...parse(await native.readImage(uris[i], i)));
  }
  return out;
}

export type AiStatus = 'available' | 'off' | 'notReady' | 'unsupported';

/** Whether this iPhone has Apple Intelligence ready to use. */
export async function aiStatus(): Promise<AiStatus> {
  if (!native) return 'unsupported';
  try {
    const status = await native.aiStatus();
    if (status === 'available') return 'available';
    if (/notEnabled/i.test(status)) return 'off';
    if (/notReady/i.test(status)) return 'notReady';
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export function aiAsk(instructions: string, prompt: string): Promise<string> {
  if (!native) return Promise.reject(new Error('unsupported'));
  return native.aiAsk(instructions, prompt);
}
