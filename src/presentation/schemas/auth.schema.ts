import { z } from 'zod';

// NZ mobile: 02X… (9-11 digits) or +64 equivalent.
const nzMobileRe = /^(\+64|0)2\d{7,9}$/;

export const registerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  // Optional (App Store 5.1.1(v)); a blank field counts as not given.
  phone: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().regex(nzMobileRe, 'Must be a valid NZ mobile (02X… or +64…)').optional(),
  ),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  captcha_id: z.string().min(1),
  captcha_answer: z.string().min(1),
});

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  target_id: z.number().int().positive(),
  target_type: z.enum(['customer', 'staff']),
  new_password: z.string().min(8),
});
