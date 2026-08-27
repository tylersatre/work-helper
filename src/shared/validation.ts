import { z } from 'zod';

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required');

const optionalTrimmedText = z
  .string()
  .nullish()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

export const noteTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, 'Note text is required');

export const entryValueSchema = z
  .string()
  .trim()
  .min(1, 'A value is required');

export const createPersonInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First and last name are required'),
  lastName: z.string().trim().min(1, 'First and last name are required'),
  email: optionalTrimmedText,
  phone: optionalTrimmedText,
  extraFields: z.record(z.string(), z.string()).optional(),
});

export const updatePersonInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First and last name are required'),
  lastName: z.string().trim().min(1, 'First and last name are required'),
  extraFields: z.record(z.string(), z.string()).optional(),
  companyId: z.number().nullable().optional(),
});

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'A name is required');

export const companyNameSchema = z
  .string()
  .trim()
  .min(1, 'A name is required');

export const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'A valid color is required');

export const taskPriorityValues = ['Low', 'Medium', 'High', 'Urgent'] as const;
export const taskEffortValues = ['S', 'M', 'L', 'XL'] as const;
export const taskPrioritySchema = z.enum(taskPriorityValues);
export const taskEffortSchema = z.enum(taskEffortValues);

export const emailSignatureInputSchema = z.object({
  signature: z.string(),
});

export const dashboardSavedViewSchema = z.object({
  lanes: z
    .array(z.string().min(1))
    .min(1, 'At least one lane is required')
    .refine((lanes) => new Set(lanes).size === lanes.length, 'Lane names must be unique'),
  tagIds: z
    .array(z.number().int())
    .refine((ids) => new Set(ids).size === ids.length, 'Tag ids must be unique'),
  text: z.string(),
  limit: z.number().int('Limit must be an integer').min(1, 'Limit must be at least 1').max(100, 'Limit must be at most 100'),
  show: z.object({
    tags: z.boolean(),
    latestNote: z.boolean(),
    links: z.boolean(),
    lane: z.boolean(),
  }),
});
