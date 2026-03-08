'use client';

import { useEffect, useState } from 'react';
import {
  clearMicrosoftTokens,
  getMicrosoftAccessToken,
} from '@/lib/microsoftAuthClient';
import { ArrowRight, CheckCircle2, Link2, RefreshCw } from 'lucide-react';
import Image from 'next/image';

type MicrosoftProfile = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

const appTiles = [
  {
    name: 'PowerPoint',
    description: 'Open generated deck outlines and slide drafts.',
    href: 'https://www.office.com/launch/powerpoint',
    logo: '/apps/powerpoint.svg',
  },
  {
    name: 'Word',
    description: 'Open generated documents and polished summaries.',
    href: 'https://www.office.com/launch/word',
    logo: '/apps/word.svg',
  },
  {
    name: 'Excel',
    description: 'Open generated sheets and analysis exports.',
    href: 'https://www.office.com/launch/excel',
    logo: '/apps/excel.svg',
  },
  {
    name: 'Outlook',
    description: 'Review inbox context and create reply drafts.',
    href: 'https://outlook.office.com/mail/',
    logo: '/apps/outlook.svg',
  },
  {
    name: 'Teams',
    description: 'Use meeting context and transcript-based summaries.',
    href: 'https://teams.microsoft.com',
    logo: '/apps/teams.svg',
  },
  {
    name: 'OneDrive',
    description: 'Browse and open generated files.',
    href: 'https://onedrive.live.com/',
    logo: '/apps/onedrive.svg',
  },
];

const AppsPage = () => {
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<MicrosoftProfile | null>(null);
  const [error, setError] = useState('');

  const refreshData = async () => {
    setRefreshing(true);
    setError('');
    const token = await getMicrosoftAccessToken();
    if (!token) {
      setConnected(false);
      setProfile(null);
      setRefreshing(false);
      return;
    }

    try {
      const meRes = await fetch('/api/microsoft/me', {
        headers: { 'x-microsoft-access-token': token },
      });
      if (!meRes.ok) throw new Error('Failed to validate Microsoft session');

      const mePayload = await meRes.json();
      setConnected(true);
      setProfile(mePayload.profile || null);
    } catch (e: any) {
      clearMicrosoftTokens();
      setConnected(false);
      setProfile(null);
      setError(e?.message || 'Microsoft session check failed');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const connectMicrosoft = async () => {
    setConnecting(true);
    setError('');
    try {
      const state = crypto.randomUUID();
      const res = await fetch(`/api/microsoft/auth?state=${encodeURIComponent(state)}`);
      const payload = await res.json();
      if (!res.ok || !payload.authUrl) {
        throw new Error(payload?.message || 'Failed to start Microsoft OAuth.');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Unable to start Microsoft OAuth');
      setConnecting(false);
    }
  };

  const disconnectMicrosoft = () => {
    clearMicrosoftTokens();
    setConnected(false);
    setProfile(null);
    setError('');
  };

  return (
    <div className="pt-10 pb-20 px-2 md:px-4">
      <h1 className="text-3xl font-semibold text-black">Apps</h1>
      <p className="mt-1 text-sm text-black/60">
        Clean Microsoft workspace integration for chat, drafts, documents, sheets, and decks.
      </p>

      <div className="mt-5 rounded-2xl border border-light-200 p-5 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-black">Microsoft 365 OAuth</p>
            <p className="text-sm text-black/65">
              {connected
                ? `Connected as ${profile?.mail || profile?.userPrincipalName || profile?.displayName || 'Microsoft account'}`
                : 'Not connected'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {connected ? (
              <>
                <button
                  onClick={connectMicrosoft}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-light-200 text-sm"
                >
                  <Link2 size={14} />
                  Reconnect OAuth
                </button>
                <button
                  onClick={refreshData}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-light-200 text-sm disabled:opacity-60"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={disconnectMicrosoft}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connectMicrosoft}
                disabled={connecting}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm disabled:opacity-60"
              >
                <ArrowRight size={14} />
                {connecting ? 'Opening OAuth...' : 'Connect Microsoft'}
              </button>
            )}
          </div>
        </div>
        {connected ? (
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            OAuth active
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {appTiles.map((app) => (
          <a
            key={app.name}
            href={app.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-light-200 p-4 bg-white block hover:border-sky-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <Image
                src={app.logo}
                alt={`${app.name} logo`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-md"
              />
              <div>
                <p className="font-medium text-black">{app.name}</p>
                <p className="mt-1 text-sm text-black/70">{app.description}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default AppsPage;
