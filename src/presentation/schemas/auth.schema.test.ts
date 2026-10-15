import { describe, it, expect } from 'vitest';
import { registerSchema } from './auth.schema';

// App Store 5.1.1(v): phone must not be required to register.
describe('registerSchema phone', () => {
  const base = { first_name: 'A', last_name: 'B', email: 'a@b.co', password: 'secret123', captcha_id: 'c', captcha_answer: '1' };
  it('is optional; blank counts as not given', () => {
    expect(registerSchema.parse(base).phone).toBeUndefined();
    expect(registerSchema.parse({ ...base, phone: '  ' }).phone).toBeUndefined();
  });
  it('is still validated when given', () => {
    expect(registerSchema.parse({ ...base, phone: '0211234567' }).phone).toBe('0211234567');
    expect(registerSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
  });
});
