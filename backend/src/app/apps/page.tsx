'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  clearMicrosoftTokens,
  getMicrosoftAccessToken,
  getMicrosoftGrantedScopes,
  hasMicrosoftAppScopes,
} from '@/lib/microsoftAuthClient';
import {
  clearGoogleTokens,
  getGoogleAccessToken,
  getGoogleGrantedScopes,
  hasGoogleAppScopes,
} from '@/lib/googleAuthClient';
import type { MicrosoftAppKey } from '@/lib/microsoftScopes';
import type { GoogleAppKey } from '@/lib/googleScopes';
import { ArrowRight, CheckCircle2, Link2, RefreshCw } from 'lucide-react';

type MicrosoftProfile = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

type GoogleProfile = {
  name?: string;
  email?: string;
};

const appTiles = [
  {
    key: 'powerpoint' as MicrosoftAppKey,
    name: 'PowerPoint',
    description: 'Open generated deck outlines and slide drafts.',
    href: 'https://www.office.com/launch/powerpoint',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/powerpoint_48x1.svg',
    accent: 'from-orange-50 to-rose-50',
  },
  {
    key: 'word' as MicrosoftAppKey,
    name: 'Word',
    description: 'Open generated documents and polished summaries.',
    href: 'https://www.office.com/launch/word',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/word_48x1.svg',
    accent: 'from-blue-50 to-indigo-50',
  },
  {
    key: 'excel' as MicrosoftAppKey,
    name: 'Excel',
    description: 'Open generated sheets and analysis exports.',
    href: 'https://www.office.com/launch/excel',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/excel_48x1.svg',
    accent: 'from-emerald-50 to-green-50',
  },
  {
    key: 'outlook' as MicrosoftAppKey,
    name: 'Outlook',
    description: 'Review inbox context and create reply drafts.',
    href: 'https://outlook.office.com/mail/',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/outlook_48x1.svg',
    accent: 'from-sky-50 to-cyan-50',
  },
  {
    key: 'teams' as MicrosoftAppKey,
    name: 'Teams',
    description: 'Use meeting context and transcript-based summaries.',
    href: 'https://teams.microsoft.com',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/teams_48x1.svg',
    accent: 'from-violet-50 to-indigo-50',
  },
  {
    key: 'onedrive' as MicrosoftAppKey,
    name: 'OneDrive',
    description: 'Browse and open generated files.',
    href: 'https://onedrive.live.com/',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/onedrive_48x1.svg',
    accent: 'from-cyan-50 to-sky-50',
  },
  {
    key: 'calendar' as MicrosoftAppKey,
    name: 'Calendar',
    description: 'Review events and use schedule context in workflows.',
    href: 'https://outlook.office.com/calendar/',
    logo: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/calendar_48x1.svg',
    accent: 'from-indigo-50 to-blue-50',
  },
];

const googleAppTiles = [
  {
    key: 'slides' as GoogleAppKey,
    name: 'Google Slides',
    description: 'Create and update slide decks from one prompt.',
    href: 'https://slides.google.com/',
    logo: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_presentation_x32.png',
    accent: 'from-amber-50 to-orange-50',
  },
  {
    key: 'docs' as GoogleAppKey,
    name: 'Google Docs',
    description: 'Write and iterate documents from AI context.',
    href: 'https://docs.google.com/document/',
    logo: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_document_x32.png',
    accent: 'from-blue-50 to-indigo-50',
  },
  {
    key: 'sheets' as GoogleAppKey,
    name: 'Google Sheets',
    description: 'Read and write spreadsheets with AI workflows.',
    href: 'https://docs.google.com/spreadsheets/',
    logo: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x32.png',
    accent: 'from-green-50 to-emerald-50',
  },
  {
    key: 'gmail' as GoogleAppKey,
    name: 'Gmail',
    description: 'Search inbox and draft messages with confirmation.',
    href: 'https://mail.google.com/',
    logo: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    accent: 'from-red-50 to-rose-50',
  },
  {
    key: 'drive' as GoogleAppKey,
    name: 'Google Drive',
    description: 'Find files and use them as context for AI tasks.',
    href: 'https://drive.google.com/',
    logo: 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_32dp.png',
    accent: 'from-cyan-50 to-sky-50',
  },
  {
    key: 'calendar' as GoogleAppKey,
    name: 'Google Calendar',
    description: 'Use calendar context and schedule-aware planning.',
    href: 'https://calendar.google.com/',
    logo: 'https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_31_2x.png',
    accent: 'from-indigo-50 to-violet-50',
  },
];

const AppsPage = () => {
  const searchParams = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [connectingApp, setConnectingApp] = useState<MicrosoftAppKey | null>(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [connectingGoogleApp, setConnectingGoogleApp] = useState<GoogleAppKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<MicrosoftProfile | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [googleGrantedScopes, setGoogleGrantedScopes] = useState<string[]>([]);
  const [error, setError] = useState('');

  const refreshData = async () => {
    setRefreshing(true);
    setError('');
    const token = await getMicrosoftAccessToken();
    const googleToken = await getGoogleAccessToken();
    if (!token) {
      setConnected(false);
      setProfile(null);
      setGrantedScopes([]);
    }

    if (!googleToken) {
      setGoogleConnected(false);
      setGoogleProfile(null);
      setGoogleGrantedScopes([]);
    }

    const failures: string[] = [];

    if (token) {
      try {
        const meRes = await fetch('/api/microsoft/me', {
          headers: { 'x-microsoft-access-token': token },
        });
        if (!meRes.ok) throw new Error('Failed to validate Microsoft session');

        const mePayload = await meRes.json();
        setConnected(true);
        setProfile(mePayload.profile || null);
        setGrantedScopes(getMicrosoftGrantedScopes());
      } catch (e: any) {
        clearMicrosoftTokens();
        setConnected(false);
        setProfile(null);
        setGrantedScopes([]);
        failures.push(e?.message || 'Microsoft session check failed');
      }
    }

    if (googleToken) {
      try {
        const meRes = await fetch('/api/google/me', {
          headers: { 'x-google-access-token': googleToken },
        });
        if (!meRes.ok) throw new Error('Failed to validate Google session');
        const mePayload = await meRes.json();
        setGoogleConnected(true);
        setGoogleProfile(mePayload.profile || null);
        setGoogleGrantedScopes(getGoogleGrantedScopes());
      } catch (e: any) {
        clearGoogleTokens();
        setGoogleConnected(false);
        setGoogleProfile(null);
        setGoogleGrantedScopes([]);
        failures.push(e?.message || 'Google session check failed');
      }
    }

    setError(failures.join(' | '));
    setRefreshing(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    const app = searchParams.get('app');
    const googleApp = searchParams.get('google_app');
    if (searchParams.get('connected') === '1') {
      const suffix = app ? ` for ${app}` : '';
      setError('');
      refreshData();
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/apps');
      }
      if (suffix) {
        // keep this lightweight; no toast dependency needed here.
        console.info(`Connected${suffix}`);
      }
    }
    if (searchParams.get('google_connected') === '1') {
      const suffix = googleApp ? ` for ${googleApp}` : '';
      setError('');
      refreshData();
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/apps');
      }
      if (suffix) {
        console.info(`Google connected${suffix}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const connectMicrosoft = async (app?: MicrosoftAppKey) => {
    setConnecting(true);
    setConnectingApp(app || null);
    setError('');
    try {
      const state = crypto.randomUUID();
      const query = app
        ? `/api/microsoft/auth?state=${encodeURIComponent(state)}&app=${encodeURIComponent(app)}`
        : `/api/microsoft/auth?state=${encodeURIComponent(state)}`;
      const res = await fetch(query);
      const payload = await res.json();
      if (!res.ok || !payload.authUrl) {
        throw new Error(payload?.message || 'Failed to start Microsoft OAuth.');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Unable to start Microsoft OAuth');
      setConnecting(false);
      setConnectingApp(null);
    }
  };

  const disconnectMicrosoft = () => {
    clearMicrosoftTokens();
    setConnected(false);
    setProfile(null);
    setGrantedScopes([]);
    setError('');
  };

  const connectGoogle = async (app?: GoogleAppKey) => {
    setGoogleConnecting(true);
    setConnectingGoogleApp(app || null);
    setError('');
    try {
      const state = crypto.randomUUID();
      const query = app
        ? `/api/google/auth?state=${encodeURIComponent(state)}&app=${encodeURIComponent(app)}`
        : `/api/google/auth?state=${encodeURIComponent(state)}`;
      const res = await fetch(query);
      const payload = await res.json();
      if (!res.ok || !payload.authUrl) {
        throw new Error(payload?.message || 'Failed to start Google OAuth.');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Unable to start Google OAuth');
      setGoogleConnecting(false);
      setConnectingGoogleApp(null);
    }
  };

  const disconnectGoogle = () => {
    clearGoogleTokens();
    setGoogleConnected(false);
    setGoogleProfile(null);
    setGoogleGrantedScopes([]);
    setError('');
  };

  const appConnectionMap = useMemo(() => {
    const mapped = new Map<MicrosoftAppKey, boolean>();
    appTiles.forEach((app) => {
      mapped.set(app.key, connected && hasMicrosoftAppScopes(app.key));
    });
    return mapped;
  }, [connected, grantedScopes]);

  const googleAppConnectionMap = useMemo(() => {
    const mapped = new Map<GoogleAppKey, boolean>();
    googleAppTiles.forEach((app) => {
      mapped.set(app.key, googleConnected && hasGoogleAppScopes(app.key));
    });
    return mapped;
  }, [googleConnected, googleGrantedScopes]);

  return (
    <div className="pt-10 pb-20 px-2 md:px-4">
      <h1 className="text-3xl font-semibold tracking-tight text-black">Apps</h1>
      <p className="mt-1 text-sm text-black/60">
        Microsoft workspace hub across Outlook, OneDrive, Word, Excel, PowerPoint, Teams, and Calendar.
      </p>

      <div className="mt-5 rounded-3xl border border-light-200 bg-white p-5 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.35)]">
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
                  onClick={() => connectMicrosoft()}
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
                onClick={() => connectMicrosoft()}
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

      <div className="mt-6 rounded-3xl border border-light-200 bg-white p-4 shadow-[0_16px_55px_-35px_rgba(0,0,0,0.35)]">
        <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
          Microsoft App Suite
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {appTiles.map((app) => (
          <div
            key={app.name}
            className={`block rounded-2xl border border-light-200 bg-gradient-to-br ${app.accent} p-4 transition-all hover:-translate-y-0.5 hover:shadow-md`}
          >
            <div className="flex items-center gap-3">
              <img
                src={app.logo}
                alt={`${app.name} logo`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg bg-white p-1 shadow-sm"
              />
              <div>
                <p className="font-medium text-black">{app.name}</p>
                <p className="mt-1 text-sm text-black/70">{app.description}</p>
                <p className="mt-2 text-xs font-medium text-black/60">
                  {appConnectionMap.get(app.key)
                    ? 'Connected for AI workflows'
                    : 'Not connected for AI workflows'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => connectMicrosoft(app.key)}
                    disabled={connecting}
                    className="inline-flex items-center gap-1 rounded-lg border border-light-200 bg-white px-2 py-1 text-xs font-medium text-black disabled:opacity-60"
                  >
                    <Link2 size={12} />
                    {connecting && connectingApp === app.key ? 'Connecting...' : `Connect ${app.name}`}
                  </button>
                  <a
                    href={app.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-light-200 bg-white px-2 py-1 text-xs font-medium text-black"
                  >
                    Open app
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-light-200 bg-white p-5 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-black">Google Workspace OAuth</p>
            <p className="text-sm text-black/65">
              {googleConnected
                ? `Connected as ${googleProfile?.email || googleProfile?.name || 'Google account'}`
                : 'Not connected'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {googleConnected ? (
              <>
                <button
                  onClick={() => connectGoogle()}
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
                  onClick={disconnectGoogle}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => connectGoogle()}
                disabled={googleConnecting}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-60"
              >
                <ArrowRight size={14} />
                {googleConnecting ? 'Opening OAuth...' : 'Connect Google'}
              </button>
            )}
          </div>
        </div>
        {googleConnected ? (
          <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            OAuth active
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-3xl border border-light-200 bg-white p-4 shadow-[0_16px_55px_-35px_rgba(0,0,0,0.35)]">
        <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
          Google App Suite
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {googleAppTiles.map((app) => (
            <div
              key={app.name}
              className={`block rounded-2xl border border-light-200 bg-gradient-to-br ${app.accent} p-4 transition-all hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={app.logo}
                  alt={`${app.name} logo`}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-lg bg-white p-1 shadow-sm"
                />
                <div>
                  <p className="font-medium text-black">{app.name}</p>
                  <p className="mt-1 text-sm text-black/70">{app.description}</p>
                  <p className="mt-2 text-xs font-medium text-black/60">
                    {googleAppConnectionMap.get(app.key)
                      ? 'Connected for AI workflows'
                      : 'Not connected for AI workflows'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => connectGoogle(app.key)}
                      disabled={googleConnecting}
                      className="inline-flex items-center gap-1 rounded-lg border border-light-200 bg-white px-2 py-1 text-xs font-medium text-black disabled:opacity-60"
                    >
                      <Link2 size={12} />
                      {googleConnecting && connectingGoogleApp === app.key
                        ? 'Connecting...'
                        : `Connect ${app.name}`}
                    </button>
                    <a
                      href={app.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-light-200 bg-white px-2 py-1 text-xs font-medium text-black"
                    >
                      Open app
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AppsPage;
