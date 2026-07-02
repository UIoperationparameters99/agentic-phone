/**
 * Secure storage for BYOK keys.
 *
 * Uses `capacitor-secure-storage-plugin` which wraps:
 *   - Android: Android Keystore (hardware-backed where available)
 *   - iOS:     Keychain (hardware-backed via Secure Enclave on supported devices)
 *
 * Keys NEVER touch localStorage, AsyncStorage, or plaintext files.
 *
 * See: docs/byok-transport.md
 */

import type { ByokConfig } from '@agentic/shared-types';

const STORAGE_KEY = 'agentic_byok_config_v1';

/**
 * Detect environment: are we running inside Capacitor (native APK) or in a web browser (dev)?
 */
async function getSecureStorage() {
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNative) {
    // Native — use the real secure-storage plugin.
    const mod = await import('capacitor-secure-storage-plugin');
    return mod.SecureStoragePlugin;
  }
  // Web dev fallback — localStorage (NOT secure, dev only).
  // In production builds, this branch is unreachable.
  return null;
}

const WEB_FALLBACK_PREFIX = '__agentic_dev_byok_';

export const secureStorage = {
  /**
   * Save BYOK config (LLM provider + key + model, sandbox provider + key).
   * Returns true on success.
   */
  async save(config: ByokConfig): Promise<boolean> {
    const plugin = await getSecureStorage();
    if (plugin) {
      await plugin.set({ key: STORAGE_KEY, value: JSON.stringify(config) });
      return true;
    }
    // Web dev fallback
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEB_FALLBACK_PREFIX + STORAGE_KEY, JSON.stringify(config));
      console.warn('[byok] Using INSECURE localStorage fallback — dev only.');
      return true;
    }
    return false;
  },

  /**
   * Load BYOK config. Returns null if not set.
   */
  async load(): Promise<ByokConfig | null> {
    const plugin = await getSecureStorage();
    if (plugin) {
      try {
        const { value } = await plugin.get({ key: STORAGE_KEY });
        return JSON.parse(value) as ByokConfig;
      } catch {
        return null;
      }
    }
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(WEB_FALLBACK_PREFIX + STORAGE_KEY);
      return v ? JSON.parse(v) : null;
    }
    return null;
  },

  /**
   * Clear BYOK config (used by "Reset all keys" button).
   */
  async clear(): Promise<void> {
    const plugin = await getSecureStorage();
    if (plugin) {
      await plugin.remove({ key: STORAGE_KEY });
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WEB_FALLBACK_PREFIX + STORAGE_KEY);
    }
  },

  /**
   * Check if a config exists (without decrypting).
   */
  async exists(): Promise<boolean> {
    const plugin = await getSecureStorage();
    if (plugin) {
      const { value } = await plugin.keys();
      return value.includes(STORAGE_KEY);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(WEB_FALLBACK_PREFIX + STORAGE_KEY) !== null;
    }
    return false;
  },
};
