export type MicrosoftAppKey =
  | 'outlook'
  | 'calendar'
  | 'onedrive'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'teams';

export type MicrosoftScopeTarget = MicrosoftAppKey | 'all';

export const MICROSOFT_BASE_SCOPES = ['openid', 'profile', 'offline_access', 'User.Read'];

const FILE_SCOPES = ['Files.Read', 'Files.ReadWrite', 'Sites.Read.All'];

export const MICROSOFT_APP_SCOPES: Record<MicrosoftAppKey, string[]> = {
  outlook: ['Mail.Read', 'Mail.ReadWrite'],
  calendar: ['Calendars.Read', 'Calendars.ReadWrite'],
  onedrive: FILE_SCOPES,
  word: FILE_SCOPES,
  excel: FILE_SCOPES,
  powerpoint: FILE_SCOPES,
  teams: ['Chat.Read', 'OnlineMeetings.Read'],
};

export const MICROSOFT_ALL_APP_KEYS: MicrosoftAppKey[] = [
  'outlook',
  'calendar',
  'onedrive',
  'word',
  'excel',
  'powerpoint',
  'teams',
];

export const MICROSOFT_APP_LABELS: Record<MicrosoftAppKey, string> = {
  outlook: 'Outlook',
  calendar: 'Calendar',
  onedrive: 'OneDrive',
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  teams: 'Teams',
};

export const isMicrosoftAppKey = (value: string | null | undefined): value is MicrosoftAppKey =>
  Boolean(value && value in MICROSOFT_APP_SCOPES);

export const isMicrosoftScopeTarget = (
  value: string | null | undefined,
): value is MicrosoftScopeTarget => Boolean(value === 'all' || isMicrosoftAppKey(value));

export const resolveScopesForApp = (app?: MicrosoftScopeTarget | null): string[] => {
  if (!app) app = 'all';

  if (app === 'all') {
    const allScopes = MICROSOFT_ALL_APP_KEYS.flatMap((key) => MICROSOFT_APP_SCOPES[key]);
    return Array.from(new Set([...MICROSOFT_BASE_SCOPES, ...allScopes]));
  }

  return Array.from(new Set([...MICROSOFT_BASE_SCOPES, ...MICROSOFT_APP_SCOPES[app]]));
};

export const createOAuthState = (input: { nonce: string; app?: MicrosoftScopeTarget | null }) => {
  const payload = {
    n: input.nonce,
    a: input.app || null,
  };
  const raw = JSON.stringify(payload);
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

export const parseOAuthState = (
  state?: string | null,
): {
  nonce?: string;
  app?: MicrosoftScopeTarget;
} => {
  if (!state) return {};
  try {
    let decoded = '';
    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(state, 'base64url').toString('utf8');
    } else {
      const normalized = state.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      decoded = decodeURIComponent(
        Array.from(atob(padded))
          .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join(''),
      );
    }
    const parsed = JSON.parse(decoded) as { n?: string; a?: string };
    const app = isMicrosoftScopeTarget(parsed?.a || '')
      ? (parsed.a as MicrosoftScopeTarget)
      : undefined;
    return {
      nonce: parsed?.n,
      app,
    };
  } catch {
    return {};
  }
};
