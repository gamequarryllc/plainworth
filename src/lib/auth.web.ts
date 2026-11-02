/** The browser preview stands in for a current iPhone, which has its own app lock. */
export const systemAppLock = true;

export async function biometricLabel(): Promise<string> {
  return 'Face ID';
}

export async function canAuthenticate(): Promise<boolean> {
  return false;
}

export async function authenticate(_reason: string): Promise<boolean> {
  return true;
}
