import { z } from 'zod';

export const registerSchema = z.object({
  identifier: z.string().min(1),
  identifier_type: z.enum(['email', 'mobile']),
  password: z.string().min(8),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  target_id: z.number().int().positive(),
  target_type: z.enum(['customer', 'staff']),
  new_password: z.string().min(8),
});
