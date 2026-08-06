import { readFileSync } from 'node:fs';
import { z } from 'zod';

const BUILT_IN_LABELS = ['first name', 'last name', 'email', 'phone'];

const personFieldsArraySchema = z
  .array(z.string().trim().min(1, 'entries must be non-empty after trimming'))
  .refine((fields) => new Set(fields.map((f) => f.toLowerCase())).size === fields.length, {
    message: 'field labels must be unique (case-insensitive)',
  })
  .refine((fields) => fields.every((f) => !BUILT_IN_LABELS.includes(f.toLowerCase())), {
    message: 'field labels must not collide with a built-in label',
  });

export function loadPersonFieldsConfig(path?: string): string[] {
  const configPath = path ?? process.env.PERSON_FIELDS_CONFIG_PATH ?? 'config/person-fields.json';

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read person fields configuration at ${configPath}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in person fields configuration at ${configPath}: ${(error as Error).message}`);
  }

  const result = personFieldsArraySchema.safeParse(parsed);
  if (!result.success) {
    const rule = result.error.issues[0]?.message ?? 'invalid person fields configuration';
    throw new Error(`Invalid person fields configuration at ${configPath}: ${rule}`);
  }

  return result.data;
}
