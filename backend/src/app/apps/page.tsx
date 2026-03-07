'use client';

import { useEffect, useState } from 'react';

type MicrosoftProfile = {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

const appTiles = [
  {
    name: 'PowerPoint',
    description: 'Open generated deck outlines.',
    href: 'https://www.office.com/launch/powerpoint',
    logo: '/apps/powerpoint.svg',
  },
  {
    name: 'Word',
    description: 'Open summaries and drafts.',
    href: 'https://www.office.com/launch/word',
    logo: '/apps/word.svg',
  },
  {
    name: 'Excel',
    description: 'Open spreadsheet analyses.',
    href: 'https://www.office.com/launch/excel',
    logo: '/apps/excel.svg',
  },
  {
    name: 'Outlook',
    description: 'Review and send draft emails.',
    href: 'https://outlook.office.com/mail/',
    logo: '/apps/outlook.svg',
  },
  {
    name: 'Teams',
    description: 'Review meeting transcript summaries.',
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

const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('atlasMicrosoftAccessToken') || '' : '';

const AppsPage = () => {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<MicrosoftProfile | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  const refreshData = async () => {
    const token = getToken();
    if (!token) {
      setConnected(false);
      setProfile(null);
      setEmails([]);
      setFiles([]);
      setMeetings([]);
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

      const [emailPayload, filePayload, meetingPayload] = await Promise.all([
        fetch('/api/microsoft/emails?top=4', {
          headers: { 'x-microsoft-access-token': token },
        })
          .then(async (res) => (res.ok ? res.json() : { emails: [] }))
          .catch(() => ({ emails: [] })),
        fetch('/api/microsoft/files', {
          headers: { 'x-microsoft-access-token': token },
        })
          .then(async (res) => (res.ok ? res.json() : { files: [] }))
          .catch(() => ({ files: [] })),
        fetch('/api/microsoft/meetings', {
          headers: { 'x-microsoft-access-token': token },
        })
          .then(async (res) => (res.ok ? res.json() : { meetings: [] }))
          .catch(() => ({ meetings: [] })),
      ]);

      setEmails((emailPayload.emails || []).slice(0, 4));
      setFiles((filePayload.files || []).slice(0, 4));
      setMeetings((meetingPayload.meetings || []).slice(0, 4));
    } catch {
      localStorage.removeItem('atlasMicrosoftAccessToken');
      localStorage.removeItem('atlasMicrosoftRefreshToken');
      localStorage.removeItem('atlasMicrosoftExpiresAt');
      setConnected(false);
      setProfile(null);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const connectMicrosoft = async () => {
    setConnecting(true);
    try {
      const state = crypto.randomUUID();
      const res = await fetch(`/api/microsoft/auth?state=${encodeURIComponent(state)}`);
      const payload = await res.json();
      if (!res.ok || !payload.authUrl) {
        throw new Error(payload?.message || 'Failed to start Microsoft OAuth.');
      }
      window.location.href = payload.authUrl;
    } catch {
      setConnecting(false);
    }
  };

  const disconnectMicrosoft = () => {
    localStorage.removeItem('atlasMicrosoftAccessToken');
    localStorage.removeItem('atlasMicrosoftRefreshToken');
    localStorage.removeItem('atlasMicrosoftExpiresAt');
    setConnected(false);
    setProfile(null);
    setEmails([]);
    setFiles([]);
    setMeetings([]);
  };

  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Apps</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Connect Microsoft 365 and open generated outputs fast.
      </p>

      <div className="mt-5 rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-black dark:text-white">Microsoft 365</p>
            <p className="text-sm text-black/65 dark:text-white/65">
              {connected
                ? `Connected as ${profile?.mail || profile?.userPrincipalName || profile?.displayName || 'Microsoft account'}`
                : 'Not connected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <button
                  onClick={connectMicrosoft}
                  className="px-3 py-1.5 rounded-lg border border-light-200 dark:border-dark-200 text-sm"
                >
                  Reconnect
                </button>
                <button
                  onClick={refreshData}
                  className="px-3 py-1.5 rounded-lg border border-light-200 dark:border-dark-200 text-sm"
                >
                  Refresh
                </button>
                <button
                  onClick={disconnectMicrosoft}
                  className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-sm"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connectMicrosoft}
                disabled={connecting}
                className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm disabled:opacity-60"
              >
                {connecting ? 'Connecting...' : 'Connect Microsoft'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {appTiles.map((app) => (
          <a
            key={app.name}
            href={app.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary block hover:border-sky-500/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <img src={app.logo} alt={`${app.name} logo`} className="h-10 w-10 rounded-md" />
              <div>
                <p className="font-medium text-black dark:text-white">{app.name}</p>
                <p className="mt-1 text-sm text-black/70 dark:text-white/70">{app.description}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {connected && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
            <p className="font-medium text-black dark:text-white">Recent Emails</p>
            <div className="mt-2 space-y-2">
              {emails.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60">No emails loaded.</p>
              ) : (
                emails.map((email) => (
                  <a
                    key={email.id}
                    href={email.webLink || 'https://outlook.office.com/mail/'}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-light-200 dark:border-dark-200 p-2 hover:border-sky-500/50"
                  >
                    <p className="text-sm text-black dark:text-white line-clamp-1">
                      {email.subject || 'Untitled email'}
                    </p>
                    <p className="text-xs text-sky-500 mt-1">View in Outlook</p>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
            <p className="font-medium text-black dark:text-white">Recent Files</p>
            <div className="mt-2 space-y-2">
              {files.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60">No files loaded.</p>
              ) : (
                files.map((file) => (
                  <a
                    key={file.id}
                    href={file.webUrl || 'https://onedrive.live.com/'}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-light-200 dark:border-dark-200 p-2 hover:border-sky-500/50"
                  >
                    <p className="text-sm text-black dark:text-white line-clamp-1">
                      {file.name || 'Untitled file'}
                    </p>
                    <p className="text-xs text-sky-500 mt-1">View in OneDrive</p>
                  </a>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
            <p className="font-medium text-black dark:text-white">Recent Meetings</p>
            <div className="mt-2 space-y-2">
              {meetings.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60">No meetings loaded.</p>
              ) : (
                meetings.map((meeting) => (
                  <a
                    key={meeting.id}
                    href={meeting.joinWebUrl || 'https://teams.microsoft.com'}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-light-200 dark:border-dark-200 p-2 hover:border-sky-500/50"
                  >
                    <p className="text-sm text-black dark:text-white line-clamp-1">
                      {meeting.subject || 'Teams meeting'}
                    </p>
                    <p className="text-xs text-sky-500 mt-1">View in Teams</p>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppsPage;
