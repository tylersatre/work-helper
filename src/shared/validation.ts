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
});

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'A name is required');

export const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'A valid color is required');
