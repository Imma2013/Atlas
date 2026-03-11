'use client';

import { GOOGLE_APP_SCOPES } from '@/lib/googleScopes';
import type { GoogleAppKey } from '@/lib/googleScopes';

const ACCESS_TOKEN_KEY = 'atlasGoogleAccessToken';
const REFRESH_TOKEN_KEY = 'atlasGoogleRefreshToken';
const EXPIRES_AT_KEY = 'atlasGoogleExpiresAt';
const SCOPE_KEY = 'atlasGoogleGrantedScopes';

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

export const clearGoogleTokens = () => {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(SCOPE_KEY);
};

export const storeGoogleTokens = (tokens: {
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

export const getGoogleAccessToken = async (app?: GoogleAppKey): Promise<string> => {
  const { accessToken, refreshToken, expiresAt } = getStored();
  if (!accessToken) return '';

  const needsRefresh = expiresAt > 0 && Date.now() >= expiresAt - 60_000;
  if (!needsRefresh) return accessToken;

  if (!refreshToken) {
    clearGoogleTokens();
    return '';
  }

  try {
    const res = await fetch('/api/google/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, app }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.tokens?.access_token) {
      clearGoogleTokens();
      return '';
    }
    storeGoogleTokens({
      ...payload.tokens,
      refresh_token: payload.tokens.refresh_token || refreshToken,
    });
    return payload.tokens.access_token as string;
  } catch {
    clearGoogleTokens();
    return '';
  }
};

export const getGoogleGrantedScopes = (): string[] => {
  const scope = getStored().scope;
  if (!scope) return [];
  return scope.split(/\s+/).map((v) => v.trim()).filter(Boolean);
};

export const hasGoogleAppScopes = (app: GoogleAppKey): boolean => {
  const granted = new Set(getGoogleGrantedScopes());
  const required = GOOGLE_APP_SCOPES[app] || [];
  return required.every((scope) => granted.has(scope));
};

