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

export const personInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First and last name are required'),
  lastName: z.string().trim().min(1, 'First and last name are required'),
  email: optionalTrimmedText,
  phone: optionalTrimmedText,
  extraFields: z.record(z.string(), z.string()).optional(),
});
