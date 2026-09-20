import { z } from 'zod';

/// Empty string means "clear this field" -> NULL. A key left out entirely stays
/// `undefined` and the repository leaves that column alone.
const clearable = (inner: z.ZodType<string>) =>
  z
    .string()
    .transform(s => s.trim())
    .transform(s => (s === '' ? null : s))
    .nullable()
    .superRefine((val, ctx) => {
      if (val === null) return;
      const result = inner.safeParse(val);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ code: 'custom', message: issue.message });
        }
      }
    });

/// Only http/https is accepted — these values are handed to `url_launcher` on
/// the client, so `javascript:`, `file:`, `data:` etc. must be rejected.
const httpUrl = (max: number) =>
  z
    .string()
    .max(max)
    .refine(v => {
      let parsed: URL;
      try {
        parsed = new URL(v);
      } catch {
        return false;
      }
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }, 'Must be a valid http(s) URL');

export const updateAppSettingsSchema = z
  .object({
    support_email: clearable(z.string().email().max(255)),
    support_phone: clearable(z.string().max(40)),
    support_hours: clearable(z.string().max(120)),
    contact_address: clearable(z.string().max(255)),
    facebook_url: clearable(httpUrl(500)),
    instagram_url: clearable(httpUrl(500)),
    whatsapp_url: clearable(httpUrl(500)),
  })
  .partial()
  .strict();

export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;
