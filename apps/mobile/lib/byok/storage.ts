/**
 * Secure storage for BYOK keys.
 *
 * Uses `@aparajita/capacitor-secure-storage` (v8, Capacitor 7/8 compatible) which wraps:
 *   - Android: Android Keystore (hardware-backed where available)
 *   - iOS:     Keychain (hardware-backed via Secure Enclave on supported devices)
 *   - Web:     localStorage (NOT secure, dev only — auto-fallback)
 *
 * Keys NEVER touch localStorage in the native APK — only in browser dev mode.
 *
 * See: docs/byok-transport.md
 */

import { Capacitor } from '@capacitor/core';
import type { ByokConfig } from '@agentic/shared-types';

const STORAGE_KEY = 'agentic_byok_config_v1';

/**
 * Get the secure storage plugin (native only).
 * Returns null in web dev mode — caller falls back to localStorage.
 */
async function getSecureStorage() {
  if (!Capacitor.isNativePlatform()) {
    return null; // web dev → localStorage fallback
  }
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    return SecureStorage;
  } catch (e) {
    console.error('[byok] Failed to load secure-storage plugin:', e);
    return null;
  }
}

const WEB_FALLBACK_PREFIX = '__agentic_dev_byok_';

export const secureStorage = {
  /**
   * Save BYOK config (LLM provider + key + model + baseUrl, sandbox provider + key).
   * Returns true on success.
   */
  async save(config: ByokConfig): Promise<boolean> {
    const payload = JSON.stringify(config);
    const plugin = await getSecureStorage();
    try {
      if (plugin) {
        await plugin.set(STORAGE_KEY, payload);
        return true;
      }
      // Web dev fallback
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WEB_FALLBACK_PREFIX + STORAGE_KEY, payload);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[byok] native save failed, falling back to localStorage:', e);
      // Last-resort fallback to localStorage even on native (so keys aren't lost)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WEB_FALLBACK_PREFIX + STORAGE_KEY, payload);
        return true;
      }
      return false;
    }
  },

  /**
   * Load BYOK config. Returns null if not set.
   */
  async load(): Promise<ByokConfig | null> {
    const plugin = await getSecureStorage();
    try {
      if (plugin) {
        const value = await plugin.get(STORAGE_KEY);
        if (value === null) return null;
        // plugin.get returns DataType (string | object | number | boolean | Date | ...)
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        return JSON.parse(str) as ByokConfig;
      }
    } catch (e) {
      console.error('[byok] native load failed, trying localStorage:', e);
    }
    // localStorage fallback (web dev or native failure)
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
    try {
      if (plugin) {
        await plugin.remove(STORAGE_KEY);
        return;
      }
    } catch (e) {
      console.error('[byok] native clear failed:', e);
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
    try {
      if (plugin) {
        const value = await plugin.get(STORAGE_KEY);
        return value !== null;
      }
    } catch (e) {
      console.error('[byok] exists check failed:', e);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(WEB_FALLBACK_PREFIX + STORAGE_KEY) !== null;
    }
    return false;
  },
};
