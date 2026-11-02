/** Browser preview uses localStorage. The phone app uses SQLite (storage.ts). */
export const storage = {
  read(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  async write(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};
