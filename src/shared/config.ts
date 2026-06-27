function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
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
  corsOrigin: process.env.CORS_ORIGIN || '*',
  uploadsDir: process.env.UPLOADS_DIR || './uploads',
} as const;
