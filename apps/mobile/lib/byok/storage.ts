/**
 * BYOK key storage.
 *
 * Uses localStorage directly (synchronous, never hangs).
 *
 * Why not a native plugin?
 *   - @aparajita/capacitor-secure-storage@8 is for Cap 8 (we're on Cap 7) → hangs
 *   - @capacitor/preferences@7 works but is async → can still hang if the WebView
 *     has issues, and the user sees an infinite spinner
 *   - localStorage in a Capacitor WebView IS persistent across app restarts
 *   - The earlier "keys vanishing" bug was NOT a storage issue — it was the store
 *     not calling loadByok() on the BYOK page. That's been fixed.
 *
 * Trade-off: keys are stored in plaintext in localStorage (not hardware-backed
 * Keystore). This is acceptable for v1 — a future version can add AES encryption
 * with a key derived from the device.
 *
 * See: docs/byok-transport.md
 */

import type { ByokConfig } from '@agentic/shared-types';

const STORAGE_KEY = 'agentic_byok_config_v1';

export const secureStorage = {
  /**
   * Save BYOK config. Synchronous — never hangs.
   */
  save(config: ByokConfig): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (e) {
      console.error('[byok] save failed:', e);
      return false;
    }
  },

  /**
   * Load BYOK config. Synchronous — never hangs.
   */
  load(): ByokConfig | null {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v ? JSON.parse(v) as ByokConfig : null;
    } catch (e) {
      console.error('[byok] load failed:', e);
      return null;
    }
  },

  /**
   * Clear BYOK config.
   */
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('[byok] clear failed:', e);
    }
  },

  /**
   * Check if a config exists.
   */
  exists(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  },
};
