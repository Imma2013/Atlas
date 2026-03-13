'use client';

import { MICROSOFT_APP_SCOPES } from '@/lib/microsoftScopes';
import type { MicrosoftAppKey } from '@/lib/microsoftScopes';

const ACCESS_TOKEN_KEY = 'atlasMicrosoftAccessToken';
const REFRESH_TOKEN_KEY = 'atlasMicrosoftRefreshToken';
const EXPIRES_AT_KEY = 'atlasMicrosoftExpiresAt';
const SCOPE_KEY = 'atlasMicrosoftGrantedScopes';

const isBrowser = () => typeof window !== 'undefined';

const getStored = () => {
  if (!isBrowser()) {
    return { accessToken: '', refreshToken: '', expiresAt: 0, scope: '' };
  }

  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
    expiresAt: Number(localStorage.getItem(EXPIRES_AT_KEY) || '0'),
    scope: localStorage.getItem(SCOPE_KEY) || '',
  };
};

export const clearMicrosoftTokens = () => {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(SCOPE_KEY);
};

export const storeMicrosoftTokens = (tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}) => {
  if (!isBrowser()) return;
  const expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }
  localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  if (typeof tokens.scope === 'string') {
    localStorage.setItem(SCOPE_KEY, tokens.scope);
  }
};

export const getMicrosoftAccessToken = async (app?: MicrosoftAppKey): Promise<string> => {
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
      body: JSON.stringify({ refreshToken, app }),
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

export const getMicrosoftGrantedScopes = (): string[] => {
  const scope = getStored().scope;
  if (!scope) return [];
  return scope
    .split(/\s+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
};

export const hasMicrosoftAppScopes = (app: MicrosoftAppKey): boolean => {
  const granted = new Set(getMicrosoftGrantedScopes());
  const required = MICROSOFT_APP_SCOPES[app] || [];
  return required.every((scope) => granted.has(scope.toLowerCase()));
};
