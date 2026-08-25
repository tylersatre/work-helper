import { readFileSync } from 'node:fs';
import { z } from 'zod';

const lanesArraySchema = z
  .array(z.string().trim().min(1, 'entries must be non-empty after trimming'))
  .min(1, 'must contain at least one lane')
  .refine((lanes) => new Set(lanes).size === lanes.length, {
    message: 'lane names must be unique',
  });

const lanesConfigObjectSchema = z
  .object({
    lanes: lanesArraySchema,
    dashboardDefaultLanes: z
      .array(z.string())
      .min(1, 'dashboardDefaultLanes must contain at least one lane')
      .refine((entries) => new Set(entries).size === entries.length, { message: 'dashboardDefaultLanes must be unique' })
      .optional(),
    quickDoneLane: z.string().optional(),
  })
  .refine((config) => (config.dashboardDefaultLanes ?? []).every((lane) => config.lanes.includes(lane)), {
    message: 'dashboardDefaultLanes must reference configured lanes',
    path: ['dashboardDefaultLanes'],
  })
  .refine((config) => config.quickDoneLane === undefined || config.lanes.includes(config.quickDoneLane), {
    message: 'quickDoneLane must reference a configured lane',
    path: ['quickDoneLane'],
  });

const lanesConfigFileSchema = z.union([lanesArraySchema, lanesConfigObjectSchema]);

export interface LanesConfig {
  lanes: string[];
  dashboard: { defaultLanes: string[]; quickDoneLane: string };
}

export function loadLanesConfig(path?: string): LanesConfig {
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

  const result = lanesConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    const rule = result.error.issues[0]?.message ?? 'invalid lane configuration';
    throw new Error(`Invalid lane configuration at ${configPath}: ${rule}`);
  }

  if (Array.isArray(result.data)) {
    const lanes = result.data;
    return { lanes, dashboard: { defaultLanes: [lanes[0]!], quickDoneLane: lanes[lanes.length - 1]! } };
  }

  const { lanes, dashboardDefaultLanes, quickDoneLane } = result.data;
  return {
    lanes,
    dashboard: {
      defaultLanes: dashboardDefaultLanes ?? [lanes[0]!],
      quickDoneLane: quickDoneLane ?? lanes[lanes.length - 1]!,
    },
  };
}
