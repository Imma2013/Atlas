'use client';

import { useEffect, useState } from 'react';
import {
  clearMicrosoftTokens,
  getMicrosoftAccessToken,
  hasMicrosoftAppScopes,
} from '@/lib/microsoftAuthClient';
import type { MicrosoftAppKey } from '@/lib/microsoftScopes';
import { ChevronRight, Link2, LogOut, RefreshCw, UserRound } from 'lucide-react';

const connectors: Array<{
  key: MicrosoftAppKey;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    key: 'outlook',
    label: 'Outlook Mail',
    description: 'Read inbox context and create drafts.',
    icon: '/apps/outlook.svg',
  },
  {
    key: 'calendar',
    label: 'Outlook Calendar',
    description: 'Read events and scheduling context.',
    icon: '/apps/outlook.svg',
  },
  {
    key: 'word',
    label: 'Word',
    description: 'Create and update documents.',
    icon: '/apps/word.svg',
  },
  {
    key: 'excel',
    label: 'Excel',
    description: 'Create and update spreadsheets.',
    icon: '/apps/excel.svg',
  },
  {
    key: 'powerpoint',
    label: 'PowerPoint',
    description: 'Create and update presentations.',
    icon: '/apps/powerpoint.svg',
  },
  {
    key: 'onedrive',
    label: 'OneDrive',
    description: 'Store and open generated files.',
    icon: '/apps/onedrive.svg',
  },
  {
    key: 'teams',
    label: 'Teams',
    description: 'Read chat and meeting context.',
    icon: '/apps/teams.svg',
  },
];

const SettingsPage = () => {
  const [tab, setTab] = useState<'account' | 'connections'>('account');
  const [connecting, setConnecting] = useState<MicrosoftAppKey | ''>('');
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('Astro User');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');

  const refreshSession = async () => {
    setRefreshing(true);
    setError('');
    try {
      const token = await getMicrosoftAccessToken();
      if (!token) {
        setConnected(false);
        setEmail('');
        setName('Astro User');
        return;
      }
      const meRes = await fetch('/api/microsoft/me', {
        headers: { 'x-microsoft-access-token': token },
      });
      const payload = await meRes.json().catch(() => ({}));
      if (!meRes.ok) throw new Error(payload?.message || 'Failed to validate Microsoft session');
      setConnected(true);
      setEmail(payload?.profile?.mail || payload?.profile?.userPrincipalName || '');
      setName(payload?.profile?.displayName || 'Astro User');
      setVersion((x) => x + 1);
    } catch (e: any) {
      setError(e?.message || 'Could not refresh account');
      setConnected(false);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const connect = async (app: MicrosoftAppKey) => {
    setConnecting(app);
    setError('');
    try {
      const state = crypto.randomUUID();
      const res = await fetch(
        `/api/microsoft/auth?state=${encodeURIComponent(state)}&app=${encodeURIComponent(app)}`,
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.authUrl) {
        throw new Error(payload?.message || 'Failed to start Microsoft OAuth');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Connect failed');
      setConnecting('');
    }
  };

  const disconnect = () => {
    clearMicrosoftTokens();
    setConnected(false);
    setEmail('');
    setName('Astro User');
    setVersion((x) => x + 1);
  };

  return (
    <div className="px-2 pb-20 pt-8 md:px-4">
      <div className="mx-auto max-w-5xl rounded-3xl border border-light-200 bg-white shadow-[0_20px_80px_-50px_rgba(0,0,0,0.45)]">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
          <aside className="border-r border-light-200 p-4">
            <p className="mb-3 text-2xl font-semibold tracking-tight">Astro</p>
            <button
              onClick={() => setTab('account')}
              className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm ${
                tab === 'account' ? 'bg-light-200 font-medium' : 'hover:bg-light-100'
              }`}
            >
              Account
            </button>
            <button
              onClick={() => setTab('connections')}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                tab === 'connections' ? 'bg-light-200 font-medium' : 'hover:bg-light-100'
              }`}
            >
              Connections
            </button>
          </aside>

          <section className="p-5">
            {tab === 'account' ? (
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
                <div className="mt-5 rounded-2xl border border-light-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                        <UserRound size={22} />
                      </div>
                      <div>
                        <p className="text-lg font-medium">{name}</p>
                        <p className="text-sm text-black/60">{email || 'Not connected'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={refreshSession}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1 rounded-lg border border-light-200 px-3 py-1.5 text-sm disabled:opacity-60"
                      >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                      <button
                        onClick={disconnect}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700"
                      >
                        <LogOut size={14} />
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Connections</h1>
                <div className="mt-5 divide-y divide-light-200 rounded-2xl border border-light-200">
                  {connectors.map((item) => {
                    const active = connected && hasMicrosoftAppScopes(item.key);
                    return (
                      <div key={`${item.key}-${version}`} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3">
                          <img src={item.icon} alt={`${item.label} logo`} className="h-8 w-8 rounded-md" />
                          <div>
                            <p className="font-medium">{item.label}</p>
                            <p className="text-sm text-black/60">{item.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {active ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                              Connected
                            </span>
                          ) : (
                            <button
                              onClick={() => connect(item.key)}
                              disabled={Boolean(connecting)}
                              className="inline-flex items-center gap-1 rounded-lg border border-light-200 px-3 py-1.5 text-sm disabled:opacity-60"
                            >
                              <Link2 size={13} />
                              {connecting === item.key ? 'Connecting...' : 'Connect'}
                            </button>
                          )}
                          <ChevronRight size={16} className="text-black/40" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
