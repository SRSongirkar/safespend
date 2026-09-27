import path from 'path';

export interface AppConfig {
  secret: string;
  dataDir: string;
  isProd: boolean;
}

/** Read and validate configuration. Throws a clear error when APP_SECRET is missing or too short. */
export function getConfig(): AppConfig {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'APP_SECRET is missing or shorter than 32 characters. Committed refuses to start without it.\n' +
        'Create one with:\n' +
        `  node -e "console.log('APP_SECRET='+require('crypto').randomBytes(32).toString('hex'))" >> .env.local\n` +
        'then restart the server.',
    );
  }
  return {
    secret,
    dataDir: path.resolve(process.cwd(), process.env.DATA_DIR || '.data'),
    isProd: process.env.NODE_ENV === 'production',
  };
}
