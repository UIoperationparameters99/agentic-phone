/**
 * Secure storage for BYOK keys.
 *
 * Uses `@capacitor/preferences` (official Capacitor plugin, version-matched).
 *   - Android: stores in SharedPreferences (not hardware-backed, but persistent)
 *   - iOS: stores in UserDefaults
 *   - Web: stores in localStorage (dev only)
 *
 * Keys persist across app restarts. For hardware-backed Keystore security,
 * a future version can add an encryption layer on top.
 *
 * See: docs/byok-transport.md
 */

import { Capacitor } from '@capacitor/core';
import type { ByokConfig } from '@agentic/shared-types';

const STORAGE_KEY = 'agentic_byok_config_v1';

/**
 * Get the Preferences plugin (native only).
 * Returns null in web dev mode — caller falls back to localStorage.
 */
async function getPreferences() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }
  try {
    const { Preferences } = await import('@capacitor/preferences');
    return Preferences;
  } catch (e) {
    console.error('[byok] Failed to load Preferences plugin:', e);
    return null;
  }
}

const WEB_FALLBACK_KEY = '__agentic_dev_byok_config_v1';

/** Wrap a promise with a timeout — if it doesn't resolve in time, reject. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export const secureStorage = {
  /**
   * Save BYOK config. Returns true on success.
   * Never hangs — if the native plugin doesn't respond in 5s, falls back to localStorage.
   */
  async save(config: ByokConfig): Promise<boolean> {
    const payload = JSON.stringify(config);
    const plugin = await getPreferences();

    if (plugin) {
      try {
        // 5s timeout — if the native plugin hangs, fall back to localStorage
        await withTimeout(plugin.set({ key: STORAGE_KEY, value: payload }), 5000, 'Preferences.set');
        return true;
      } catch (e) {
        console.error('[byok] native save failed, falling back to localStorage:', e);
        // Fall through to localStorage fallback
      }
    }

    // localStorage fallback (web dev or native failure)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEB_FALLBACK_KEY, payload);
      return true;
    }
    return false;
  },

  /**
   * Load BYOK config. Returns null if not set.
   * Never hangs — 5s timeout on native, falls back to localStorage.
   */
  async load(): Promise<ByokConfig | null> {
    const plugin = await getPreferences();

    if (plugin) {
      try {
        const { value } = await withTimeout(plugin.get({ key: STORAGE_KEY }), 5000, 'Preferences.get');
        if (value) return JSON.parse(value) as ByokConfig;
        // Not found in native — check localStorage too (migration from old version)
      } catch (e) {
        console.error('[byok] native load failed, trying localStorage:', e);
      }
    }

    // localStorage fallback
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(WEB_FALLBACK_KEY);
      return v ? JSON.parse(v) : null;
    }
    return null;
  },

  /**
   * Clear BYOK config.
   */
  async clear(): Promise<void> {
    const plugin = await getPreferences();
    if (plugin) {
      try {
        await withTimeout(plugin.remove({ key: STORAGE_KEY }), 5000, 'Preferences.remove');
        return;
      } catch (e) {
        console.error('[byok] native clear failed:', e);
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WEB_FALLBACK_KEY);
    }
  },

  /**
   * Check if a config exists.
   */
  async exists(): Promise<boolean> {
    const plugin = await getPreferences();
    if (plugin) {
      try {
        const { keys } = await withTimeout(plugin.keys(), 5000, 'Preferences.keys');
        if (keys.includes(STORAGE_KEY)) return true;
      } catch (e) {
        console.error('[byok] exists check failed:', e);
      }
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(WEB_FALLBACK_KEY) !== null;
    }
    return false;
  },
};
