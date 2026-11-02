import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface FileType {
  mimeType: string;
  /** Apple's name for the type. */
  uti: string;
}

export const EXCEL: FileType = {
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  uti: 'org.openxmlformats.spreadsheetml.sheet',
};

/** A Plainworth backup is JSON inside. */
export const BACKUP: FileType = { mimeType: 'application/json', uti: 'public.json' };

/**
 * Hand a file to the share sheet: Save to Files, AirDrop, Mail, Excel and so on.
 * It's written to the cache first, which the system clears when it needs space.
 */
export async function shareFile(name: string, content: Uint8Array | string, type: FileType, title: string): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: type.mimeType, UTI: type.uti, dialogTitle: title });
}
