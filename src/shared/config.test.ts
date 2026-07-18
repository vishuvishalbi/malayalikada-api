import { describe, it, expect, afterEach, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  return (await import('./config')).config;
}

describe('config', () => {
  const orig = { ...process.env };
  afterEach(() => { process.env = { ...orig }; });

  it('defaults corsOrigin to * outside production', async () => {
    process.env.JWT_SECRET = 'x';
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;
    const config = await loadConfig();
    expect(config.corsOrigin).toBe('*');
  });

  it('throws in production when CORS_ORIGIN is unset', async () => {
    process.env.JWT_SECRET = 'x';
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    await expect(loadConfig()).rejects.toThrow(/CORS_ORIGIN/);
  });

  it('enableDocs defaults false in production', async () => {
    process.env.JWT_SECRET = 'x';
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    delete process.env.ENABLE_DOCS;
    const config = await loadConfig();
    expect(config.enableDocs).toBe(false);
  });
});
