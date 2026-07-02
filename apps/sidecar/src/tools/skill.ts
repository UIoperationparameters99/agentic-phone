/**
 * Skill tool — load a SKILL.md into the agent's context.
 *
 * Mirrors z.ai's Skill tool. Skills live in {workspace}/skills/{name}/SKILL.md.
 * Calling this tool reads the SKILL.md and returns its content as the tool result,
 * which the agent then incorporates into its reasoning.
 */

import { z } from 'zod';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { ToolContext } from './index.js';

export function skillTool(ctx: ToolContext) {
  return {
    description: 'Invoke a skill by name. Loads the skill\'s SKILL.md into context. Use available skills only.',
    parameters: z.object({
      command: z.string().describe('Skill name (e.g. "pdf", "docx", "web-search")'),
    }),
    execute: async (args: { command: string }) => {
      const skillPath = join(ctx.workspace, 'skills', args.command, 'SKILL.md');
      if (!existsSync(skillPath)) {
        const available = listAvailableSkills(ctx.workspace);
        return {
          error: `Skill "${args.command}" not found`,
          available,
        };
      }
      try {
        const raw = readFileSync(skillPath, 'utf-8');
        const { data: frontmatter, content } = matter(raw);
        return {
          name: args.command,
          description: frontmatter.description,
          argumentHint: frontmatter['argument-hint'],
          license: frontmatter.license,
          instructions: content,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

export function listAvailableSkills(workspace: string): string[] {
  const skillsDir = join(workspace, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir).filter((name) => {
    const skillPath = join(skillsDir, name);
    return statSync(skillPath).isDirectory() && existsSync(join(skillPath, 'SKILL.md'));
  });
}

export function listInstalledSkills(workspace: string): Array<{ name: string; description: string; argumentHint?: string }> {
  const skillsDir = join(workspace, 'skills');
  if (!existsSync(skillsDir)) return [];
  const results: Array<{ name: string; description: string; argumentHint?: string }> = [];
  for (const name of readdirSync(skillsDir)) {
    const skillPath = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    try {
      const raw = readFileSync(skillPath, 'utf-8');
      const { data } = matter(raw);
      results.push({
        name,
        description: typeof data.description === 'string' ? data.description : '',
        argumentHint: typeof data['argument-hint'] === 'string' ? data['argument-hint'] : undefined,
      });
    } catch {
      // skip
    }
  }
  return results;
}
