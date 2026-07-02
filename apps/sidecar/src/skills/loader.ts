/**
 * Skill loader — watches the skills/ directory + serves the default pack.
 *
 * Mirrors z.ai's pattern: skills are gitignored and re-fetched from a
 * registry on each session. For v1, we ship a small default pack
 * baked into the sidecar.
 */

import { watch, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { listInstalledSkills } from '../tools/skill.js';
import { broadcastEvent } from '../transport/protocol.js';

export function startSkillLoader(skillsDir: string) {
  mkdirSync(skillsDir, { recursive: true });

  // Watch for skill changes (install/uninstall).
  try {
    watch(skillsDir, { recursive: true }, (eventType, filename) => {
      console.log(`[skills] ${eventType}: ${filename}`);
      // Broadcast updated skills list to connected clients.
      broadcastEvent({
        type: 'skill_invoked',
        skillName: '__refresh__',
        description: `Skills list updated`,
      });
    });
  } catch (e) {
    console.warn('[skills] watch failed:', e);
  }

  console.log(`[skills] watching ${skillsDir}`);
}
