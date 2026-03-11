export type GoogleAppKey =
  | 'gmail'
  | 'drive'
  | 'docs'
  | 'sheets'
  | 'slides'
  | 'calendar';

export const GOOGLE_BASE_SCOPES = ['openid', 'email', 'profile'];

export const GOOGLE_APP_SCOPES: Record<GoogleAppKey, string[]> = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
  drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ],
  docs: [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive.file',
  ],
  sheets: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ],
  slides: [
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/drive.file',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
};

export const isGoogleAppKey = (value: string | null | undefined): value is GoogleAppKey =>
  Boolean(value && value in GOOGLE_APP_SCOPES);

export const resolveScopesForGoogleApp = (app?: GoogleAppKey | null): string[] => {
  if (!app) return [...GOOGLE_BASE_SCOPES];
  return Array.from(new Set([...GOOGLE_BASE_SCOPES, ...GOOGLE_APP_SCOPES[app]]));
};

const toBase64Url = (raw: string) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (encoded: string) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(encoded, 'base64url').toString('utf8');
  }
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
};

export const createGoogleOAuthState = (input: { nonce: string; app?: GoogleAppKey | null }) =>
  toBase64Url(
    JSON.stringify({
      n: input.nonce,
      a: input.app || null,
    }),
  );

export const parseGoogleOAuthState = (
  state?: string | null,
): {
  nonce?: string;
  app?: GoogleAppKey;
} => {
  if (!state) return {};
  try {
    const decoded = fromBase64Url(state);
    const parsed = JSON.parse(decoded) as { n?: string; a?: string };
    return {
      nonce: parsed?.n,
      app: isGoogleAppKey(parsed?.a || '') ? (parsed.a as GoogleAppKey) : undefined,
    };
  } catch {
    return {};
  }
};

