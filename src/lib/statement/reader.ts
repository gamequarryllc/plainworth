import { requireOptionalNativeModule } from 'expo';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { Fragment } from './types';

/**
 * Picking a statement and reading its text, all on the phone. PDFs are read
 * with PDFKit and pictures with Apple's text recognition (the StatementReader
 * module in /modules). Nothing here uses the network.
 */

interface NativeReader {
  readPdf(uri: string): Promise<string>;
  aiStatus(): Promise<string>;
  aiAsk(instructions: string, prompt: string): Promise<string>;
}

const native = requireOptionalNativeModule<NativeReader>('StatementReader');

/** PDFs need the iPhone's own readers. */
export const canReadDocuments = native != null;

export type Picked =
  | { kind: 'table'; name: string; bytes: Uint8Array }
  | { kind: 'pdf'; name: string; uri: string }
  | { kind: 'unsupported'; name: string };

const starts = (bytes: Uint8Array, ...sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Choose one or more statements from Files, iCloud Drive and so on. Null if they cancel. */
export async function pickFiles(): Promise<Picked[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
  if (result.canceled || !result.assets?.length) return null;
  const picked: Picked[] = [];
  for (const asset of result.assets) {
    const name = asset.name ?? 'File';
    try {
      const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
      if (starts(bytes, 0x25, 0x50, 0x44, 0x46)) picked.push({ kind: 'pdf', name, uri: asset.uri });
      // Pictures, the old .xls format (not .xlsx), Numbers and Word files can't be read.
      else if (
        starts(bytes, 0xd0, 0xcf, 0x11, 0xe0) ||
        /^image\//.test(asset.mimeType ?? '') ||
        /\.(numbers|docx?|pages|png|jpe?g|heic|heif|webp|tiff?|bmp|gif)$/i.test(name)
      ) {
        picked.push({ kind: 'unsupported', name });
      } else picked.push({ kind: 'table', name, bytes });
    } catch {
      picked.push({ kind: 'unsupported', name });
    }
  }
  return picked;
}

function parse(json: string): Fragment[] {
  const list = JSON.parse(json);
  return Array.isArray(list) ? (list as Fragment[]) : [];
}

export async function pdfFragments(uri: string): Promise<Fragment[]> {
  if (!native) throw new Error('unsupported');
  return parse(await native.readPdf(uri));
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
