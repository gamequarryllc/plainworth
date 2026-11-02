import Storage from 'expo-sqlite/kv-store';

/** On-device key-value storage backed by SQLite. */
export const storage = {
  read(key: string): string | null {
    return Storage.getItemSync(key);
  },
  write(key: string, value: string): Promise<void> {
    return Storage.setItemAsync(key, value);
  },
  remove(key: string): Promise<void> {
    return Storage.removeItemAsync(key).then(() => undefined);
  },
};
