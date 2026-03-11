'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  clearMicrosoftTokens,
  getMicrosoftAccessToken,
  hasMicrosoftAppScopes,
} from '@/lib/microsoftAuthClient';
import type { MicrosoftAppKey } from '@/lib/microsoftScopes';
import { MICROSOFT_LOGOS } from '@/lib/appLogos';
import { CheckCircle2, Link2, LogOut, Mail, RefreshCw } from 'lucide-react';

type TabKey = 'account' | 'connections';

type ConnectorItem = {
  key: MicrosoftAppKey;
  label: string;
  description: string;
  icon: string;
};

const connectors: ConnectorItem[] = [
  {
    key: 'outlook',
    label: 'Outlook Mail',
    description: 'Read inbox context and create drafts.',
    icon: MICROSOFT_LOGOS.outlook,
  },
  {
    key: 'calendar',
    label: 'Calendar',
    description: 'Read events and scheduling context.',
    icon: MICROSOFT_LOGOS.calendar,
  },
  {
    key: 'word',
    label: 'Word',
    description: 'Create and update documents.',
    icon: MICROSOFT_LOGOS.word,
  },
  {
    key: 'excel',
    label: 'Excel',
    description: 'Create and update spreadsheets.',
    icon: MICROSOFT_LOGOS.excel,
  },
  {
    key: 'powerpoint',
    label: 'PowerPoint',
    description: 'Create and update presentations.',
    icon: MICROSOFT_LOGOS.powerpoint,
  },
  {
    key: 'onedrive',
    label: 'OneDrive',
    description: 'Store and open generated files.',
    icon: MICROSOFT_LOGOS.onedrive,
  },
  {
    key: 'teams',
    label: 'Teams',
    description: 'Read meeting context and transcripts.',
    icon: MICROSOFT_LOGOS.teams,
  },
];

const SettingsPage = () => {
  const searchParams = useSearchParams();
  const incomingTab = searchParams.get('tab') === 'connections' ? 'connections' : 'account';

  const [tab, setTab] = useState<TabKey>(incomingTab);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('Workspace User');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');

  const initials = useMemo(() => {
    const source = (name || email || 'Workspace User').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || 'W';
    const second = parts[1]?.[0] || '';
    return `${first}${second}`.toUpperCase();
  }, [name, email]);

  const refreshSession = async () => {
    setRefreshing(true);
    setError('');

    try {
      const token = await getMicrosoftAccessToken();
      if (!token) {
        setConnected(false);
        setEmail('');
        setName('Workspace User');
        return;
      }

      const meRes = await fetch('/api/microsoft/me', {
        headers: { 'x-microsoft-access-token': token },
      });
      const payload = await meRes.json().catch(() => ({}));
      if (!meRes.ok) throw new Error(payload?.message || 'Failed to validate Microsoft session');

      setConnected(true);
      setEmail(payload?.profile?.mail || payload?.profile?.userPrincipalName || '');
      setName(payload?.profile?.displayName || 'Workspace User');
      setVersion((x) => x + 1);
    } catch (e: any) {
      setError(e?.message || 'Could not refresh account');
      setConnected(false);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setTab(incomingTab);
  }, [incomingTab]);

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    if (
      searchParams.get('connected') === '1' ||
      searchParams.get('google_connected') === '1'
    ) {
      refreshSession();
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/settings?tab=connections');
      }
    }
  }, [searchParams]);

  const connectAllMicrosoft = async () => {
    setConnecting(true);
    setError('');

    try {
      const state = crypto.randomUUID();
      const res = await fetch(
        `/api/microsoft/auth?state=${encodeURIComponent(state)}&app=all`,
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.authUrl) {
        throw new Error(payload?.message || 'Failed to start Microsoft OAuth');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Connect failed');
      setConnecting(false);
    }
  };

  const disconnect = () => {
    clearMicrosoftTokens();
    setConnected(false);
    setEmail('');
    setName('Workspace User');
    setVersion((x) => x + 1);
  };

  return (
    <div className="px-2 pb-20 pt-8 md:px-4">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-black/10 bg-white/90 shadow-[0_24px_80px_-52px_rgba(0,0,0,0.55)] backdrop-blur-md dark:border-white/10 dark:bg-[#0f1522]/95">
        <div className="grid grid-cols-1 md:grid-cols-[230px_1fr]">
          <aside className="border-r border-black/10 p-4 dark:border-white/10">
            <p className="mb-3 text-xl font-semibold tracking-tight text-black dark:text-white">Settings</p>
            <button
              onClick={() => setTab('account')}
              className={`mb-2 w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                tab === 'account'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black/80 hover:bg-black/[0.03] dark:text-white/80 dark:hover:bg-white/[0.05]'
              }`}
            >
              Account
            </button>
            <button
              onClick={() => setTab('connections')}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                tab === 'connections'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black/80 hover:bg-black/[0.03] dark:text-white/80 dark:hover:bg-white/[0.05]'
              }`}
            >
              Connections
            </button>
          </aside>

          <section className="p-5 md:p-6">
            {tab === 'account' ? (
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-white">Account</h1>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  Single sign-in identity for your workspace automations.
                </p>
                <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 text-sm font-semibold text-white">
                        {initials}
                      </div>
                      <div>
                        <p className="text-lg font-medium text-black dark:text-white">{name}</p>
                        <p className="text-sm text-black/60 dark:text-white/60">{email || 'Not connected yet'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={refreshSession}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-3 py-1.5 text-sm text-black disabled:opacity-60 dark:border-white/15 dark:text-white"
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
                <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-white">Connections</h1>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  Connect once to unlock all Microsoft workflow actions.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <button
                    onClick={connectAllMicrosoft}
                    disabled={connecting}
                    className="inline-flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
                  >
                    <Link2 size={13} />
                    {connecting ? 'Opening OAuth...' : 'Connect Microsoft (All Scopes)'}
                  </button>
                  {connected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                      <CheckCircle2 size={13} />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      <Mail size={13} />
                      Not connected
                    </span>
                  )}
                </div>

                <div className="mt-4 divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/10">
                  {connectors.map((item) => {
                    const active = connected && hasMicrosoftAppScopes(item.key);

                    return (
                      <div key={`${item.key}-${version}`} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3">
                          <img src={item.icon} alt={`${item.label} logo`} className="h-8 w-8 rounded-md" />
                          <div>
                            <p className="font-medium text-black dark:text-white">{item.label}</p>
                            <p className="text-sm text-black/60 dark:text-white/60">{item.description}</p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-black/[0.05] text-black/65 dark:bg-white/[0.08] dark:text-white/70'
                          }`}
                        >
                          {active ? 'Connected' : 'Missing scope'}
                        </span>
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

