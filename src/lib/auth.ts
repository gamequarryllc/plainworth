import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/**
 * iOS 18 and later can lock any app with Face ID from the Home Screen (touch
 * and hold the icon, then Require Face ID), so Plainworth only offers its own lock
 * on Android and older iPhones.
 */
export const systemAppLock = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 18;

export async function biometricLabel(): Promise<string> {
  const android = Platform.OS === 'android';
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return android ? 'Face Unlock' : 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return android ? 'Fingerprint' : 'Touch ID';
  } catch {}
  return android ? 'Screen Lock' : 'Passcode';
}

export async function canAuthenticate(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
    return result.success;
  } catch {
    return false;
  }
}
