'use client';

const ACCESS_TOKEN_KEY = 'atlasMicrosoftAccessToken';
const REFRESH_TOKEN_KEY = 'atlasMicrosoftRefreshToken';
const EXPIRES_AT_KEY = 'atlasMicrosoftExpiresAt';

const isBrowser = () => typeof window !== 'undefined';

const getStored = () => {
  if (!isBrowser()) {
    return { accessToken: '', refreshToken: '', expiresAt: 0 };
  }

  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
    expiresAt: Number(localStorage.getItem(EXPIRES_AT_KEY) || '0'),
  };
};

export const clearMicrosoftTokens = () => {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
};

export const storeMicrosoftTokens = (tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}) => {
  if (!isBrowser()) return;
  const expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }
  localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
};

export const getMicrosoftAccessToken = async (): Promise<string> => {
  const { accessToken, refreshToken, expiresAt } = getStored();
  if (!accessToken) return '';

  // Refresh 60 seconds before expiry.
  const needsRefresh = expiresAt > 0 && Date.now() >= expiresAt - 60_000;
  if (!needsRefresh) return accessToken;

  if (!refreshToken) {
    clearMicrosoftTokens();
    return '';
  }

  try {
    const res = await fetch('/api/microsoft/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.tokens?.access_token) {
      clearMicrosoftTokens();
      return '';
    }

    storeMicrosoftTokens(payload.tokens);
    return payload.tokens.access_token as string;
  } catch {
    clearMicrosoftTokens();
    return '';
  }
};
