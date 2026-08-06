import { z } from 'zod';

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required');
