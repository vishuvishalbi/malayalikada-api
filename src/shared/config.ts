function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const isProd = process.env.NODE_ENV === 'production';

function corsOrigin(): string {
  const val = process.env.CORS_ORIGIN;
  if (val) return val;
  if (isProd) throw new Error('Missing required env var in production: CORS_ORIGIN');
  return '*';
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'malayalikada',
  },
  jwtSecret: required('JWT_SECRET'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  corsOrigin: corsOrigin(),
  enableDocs: process.env.ENABLE_DOCS === 'true' || !isProd,
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
} as const;
