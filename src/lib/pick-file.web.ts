import * as DocumentPicker from 'expo-document-picker';

/** The browser preview reads the chosen file directly. */
export async function pickTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return asset.file ? asset.file.text() : (await fetch(asset.uri)).text();
}
