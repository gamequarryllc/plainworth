import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/** Let the person choose a file (Files, iCloud Drive, Google Drive…) and read it as text. Null if they cancel. */
export async function pickTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  return new File(result.assets[0].uri).text();
}
