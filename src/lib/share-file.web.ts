export interface FileType {
  mimeType: string;
  uti: string;
}

export const EXCEL: FileType = {
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  uti: 'org.openxmlformats.spreadsheetml.sheet',
};

/** A Plainworth backup is JSON inside. */
export const BACKUP: FileType = { mimeType: 'application/json', uti: 'public.json' };

/** The browser preview downloads the file instead. */
export async function shareFile(name: string, content: Uint8Array | string, type: FileType, _title?: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([content as BlobPart], { type: type.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
