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
      'APP_SECRET is missing or shorter than 32 characters. SafeSpend refuses to start without it.\n' +
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

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  appUrl?: string; // optional fixed public base URL, e.g. https://safespend.onrender.com
}

/** Google sign-in + Gmail import are optional: enabled only when both credentials are set. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, '') || undefined;
  return { clientId, clientSecret, appUrl };
}
