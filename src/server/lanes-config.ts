import { readFileSync } from 'node:fs';
import { z } from 'zod';

const lanesArraySchema = z
  .array(z.string().trim().min(1, 'entries must be non-empty after trimming'))
  .min(1, 'must contain at least one lane')
  .refine((lanes) => new Set(lanes).size === lanes.length, {
    message: 'lane names must be unique',
  });

export function loadLanesConfig(path?: string): string[] {
  const configPath = path ?? process.env.LANES_CONFIG_PATH ?? 'config/lanes.json';

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read lane configuration at ${configPath}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in lane configuration at ${configPath}: ${(error as Error).message}`);
  }

  const result = lanesArraySchema.safeParse(parsed);
  if (!result.success) {
    const rule = result.error.issues[0]?.message ?? 'invalid lane configuration';
    throw new Error(`Invalid lane configuration at ${configPath}: ${rule}`);
  }

  return result.data;
}
