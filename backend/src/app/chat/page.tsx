'use client';

import { useEffect, useState } from 'react';
import {
  clearGoogleTokens,
  getGoogleAccessToken,
  hasGoogleAppScopes,
} from '@/lib/googleAuthClient';
import {
  clearMicrosoftTokens,
  getMicrosoftAccessToken,
  hasMicrosoftAppScopes,
} from '@/lib/microsoftAuthClient';
import type { GoogleAppKey } from '@/lib/googleScopes';
import type { MicrosoftAppKey } from '@/lib/microsoftScopes';
import {
  Check,
  ChevronDown,
  Globe,
  Link2,
  Plus,
  SendHorizonal,
  X,
} from 'lucide-react';

type PendingDraft = {
  provider: 'outlook' | 'gmail';
  to: string[];
  subject: string;
  body: string;
  contentType: 'Text' | 'HTML';
};

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  pendingDraft?: PendingDraft;
  draftState?: 'idle' | 'creating' | 'created' | 'failed' | 'cancelled';
  draftError?: string;
  draftWebLink?: string;
  downloads?: Array<{
    kind: 'word' | 'excel' | 'powerpoint';
    fileName: string;
    mimeType: string;
    contentBase64?: string;
    webUrl?: string;
    origin: 'microsoft' | 'google' | 'local';
  }>;
};

type ConnectorState = {
  microsoft: Record<MicrosoftAppKey, boolean>;
  google: Record<GoogleAppKey, boolean>;
};

const defaultConnectorState: ConnectorState = {
  microsoft: {
    outlook: false,
    calendar: false,
    onedrive: false,
    word: false,
    excel: false,
    powerpoint: false,
    teams: false,
  },
  google: {
    gmail: false,
    drive: false,
    docs: false,
    sheets: false,
    slides: false,
    calendar: false,
  },
};

const getOrCreateUserId = () => {
  if (typeof window === 'undefined') return undefined;
  const existing = localStorage.getItem('atlasUserId');
  if (existing) return existing;
  const created =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  localStorage.setItem('atlasUserId', created);
  return created;
};

const getOrCreateChatId = () => {
  if (typeof window === 'undefined') return `chat-${Date.now()}`;
  const existing = localStorage.getItem('atlasActiveChatId');
  if (existing) return existing;
  const created =
    typeof crypto.randomUUID === 'function'
      ? `chat-${crypto.randomUUID()}`
      : `chat-${Date.now()}-${Math.random()}`;
  localStorage.setItem('atlasActiveChatId', created);
  return created;
};

const asHistory = (messages: ChatMessage[]) =>
  messages.map((message) => [message.role === 'user' ? 'human' : 'assistant', message.text] as [string, string]);

const decodeBase64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const ChatPage = () => {
  const [includeWeb, setIncludeWeb] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [connectingKey, setConnectingKey] = useState<string>('');
  const [connectors, setConnectors] = useState<ConnectorState>(defaultConnectorState);

  const refreshConnections = async () => {
    const microsoftToken = await getMicrosoftAccessToken();
    const googleToken = await getGoogleAccessToken();

    if (!microsoftToken) {
      clearMicrosoftTokens();
    }
    if (!googleToken) {
      clearGoogleTokens();
    }

    setConnectors({
      microsoft: {
        outlook: Boolean(microsoftToken) && hasMicrosoftAppScopes('outlook'),
        calendar: Boolean(microsoftToken) && hasMicrosoftAppScopes('calendar'),
        onedrive: Boolean(microsoftToken) && hasMicrosoftAppScopes('onedrive'),
        word: Boolean(microsoftToken) && hasMicrosoftAppScopes('word'),
        excel: Boolean(microsoftToken) && hasMicrosoftAppScopes('excel'),
        powerpoint: Boolean(microsoftToken) && hasMicrosoftAppScopes('powerpoint'),
        teams: Boolean(microsoftToken) && hasMicrosoftAppScopes('teams'),
      },
      google: {
        gmail: Boolean(googleToken) && hasGoogleAppScopes('gmail'),
        drive: Boolean(googleToken) && hasGoogleAppScopes('drive'),
        docs: Boolean(googleToken) && hasGoogleAppScopes('docs'),
        sheets: Boolean(googleToken) && hasGoogleAppScopes('sheets'),
        slides: Boolean(googleToken) && hasGoogleAppScopes('slides'),
        calendar: Boolean(googleToken) && hasGoogleAppScopes('calendar'),
      },
    });
  };

  useEffect(() => {
    refreshConnections();
  }, []);

  const connectMicrosoft = async (app: MicrosoftAppKey) => {
    setConnectingKey(`ms:${app}`);
    setError('');
    try {
      const nonce = crypto.randomUUID();
      const response = await fetch(
        `/api/microsoft/auth?state=${encodeURIComponent(nonce)}&app=${encodeURIComponent(app)}`,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.authUrl) {
        throw new Error(payload?.message || payload?.error || 'Failed to start Microsoft OAuth');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Microsoft connect failed');
      setConnectingKey('');
    }
  };

  const connectGoogle = async (app: GoogleAppKey) => {
    setConnectingKey(`g:${app}`);
    setError('');
    try {
      const nonce = crypto.randomUUID();
      const response = await fetch(
        `/api/google/auth?state=${encodeURIComponent(nonce)}&app=${encodeURIComponent(app)}`,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.authUrl) {
        throw new Error(payload?.message || payload?.error || 'Failed to start Google OAuth');
      }
      window.location.href = payload.authUrl;
    } catch (e: any) {
      setError(e?.message || 'Google connect failed');
      setConnectingKey('');
    }
  };

  const submit = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userId = getOrCreateUserId();
    const chatId = getOrCreateChatId();
    const microsoftAccessToken = await getMicrosoftAccessToken();
    const googleAccessToken = await getGoogleAccessToken();
    const currentHistory = asHistory(messages);

    setError('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setInput('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(microsoftAccessToken ? { 'x-microsoft-access-token': microsoftAccessToken } : {}),
          ...(googleAccessToken ? { 'x-google-access-token': googleAccessToken } : {}),
        },
        body: JSON.stringify({
          message: {
            messageId: `msg-${Date.now()}`,
            chatId,
            content: query,
          },
          history: currentHistory,
          brainMode: true,
          userId,
          sources: includeWeb ? ['workspace', 'web'] : ['workspace'],
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Chat failed');
      }

      const output =
        typeof data?.output === 'string'
          ? data.output
          : data?.output?.answer || JSON.stringify(data?.output ?? data, null, 2);
      const downloads = Array.isArray(data?.downloads) ? data.downloads : [];
      const pendingDraft =
        data?.pendingDraft &&
        (data.pendingDraft.provider === 'gmail' || data.pendingDraft.provider === 'outlook') &&
        Array.isArray(data.pendingDraft.to) &&
        typeof data.pendingDraft.subject === 'string' &&
        typeof data.pendingDraft.body === 'string'
          ? (data.pendingDraft as PendingDraft)
          : undefined;

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: output,
          downloads,
          pendingDraft,
          draftState: pendingDraft ? 'idle' : undefined,
        },
      ]);
    } catch (e: any) {
      const message = e?.message || 'Chat request failed';
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const createEmailDraft = async (index: number) => {
    const target = messages[index];
    if (!target?.pendingDraft || target.role !== 'assistant') return;

    setMessages((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, draftState: 'creating', draftError: '' } : item,
      ),
    );

    try {
      const isGmail = target.pendingDraft.provider === 'gmail';
      const token = isGmail
        ? await getGoogleAccessToken('gmail')
        : await getMicrosoftAccessToken('outlook');
      if (!token) {
        throw new Error(
          isGmail
            ? 'Gmail is not connected. Use + to connect Gmail.'
            : 'Outlook is not connected. Use + to connect Outlook.',
        );
      }

      const response = await fetch(isGmail ? '/api/google/drafts' : '/api/microsoft/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isGmail
            ? { 'x-google-access-token': token }
            : { 'x-microsoft-access-token': token }),
        },
        body: JSON.stringify(target.pendingDraft),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Failed to create draft');
      }

      setMessages((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                draftState: 'created',
                draftError: '',
                draftWebLink: payload?.draft?.webLink || '',
              }
            : item,
        ),
      );
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, draftState: 'failed', draftError: e?.message || 'Draft creation failed' }
            : item,
        ),
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="rounded-3xl border border-light-200 bg-white p-5 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black">
              {messages.length === 0 ? 'What can Astro Agent do for you?' : 'Astro Agent'}
            </h1>
            <p className="mt-1 text-sm text-black/60">
              One agent flow: JIT router, capped tools, grounded execution.
            </p>
          </div>
          <div className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/70">
            Brain Mode
          </div>
        </div>

        <div className="relative rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.4)]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Assign a task or ask anything"
            className="w-full rounded-xl border-none bg-transparent px-2 py-2 text-sm outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConnectorOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-black/75"
              >
                <Plus size={13} />
                Connect
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                onClick={() => setIncludeWeb((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                  includeWeb
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-black/10 bg-white text-black/70'
                }`}
              >
                <Globe size={13} />
                Web {includeWeb ? 'On' : 'Off'}
              </button>

              {connectorOpen ? (
                <div className="absolute left-0 top-10 z-30 w-[360px] rounded-2xl border border-black/10 bg-white p-3 shadow-xl">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-black/45">
                    Connectors
                  </p>
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {[
                      { key: 'gmail', label: 'Gmail', state: connectors.google.gmail, run: () => connectGoogle('gmail') },
                      { key: 'calendar-g', label: 'Google Calendar', state: connectors.google.calendar, run: () => connectGoogle('calendar') },
                      { key: 'drive', label: 'Google Drive', state: connectors.google.drive, run: () => connectGoogle('drive') },
                      { key: 'docs', label: 'Google Docs', state: connectors.google.docs, run: () => connectGoogle('docs') },
                      { key: 'sheets', label: 'Google Sheets', state: connectors.google.sheets, run: () => connectGoogle('sheets') },
                      { key: 'slides', label: 'Google Slides', state: connectors.google.slides, run: () => connectGoogle('slides') },
                      { key: 'outlook', label: 'Outlook Mail', state: connectors.microsoft.outlook, run: () => connectMicrosoft('outlook') },
                      { key: 'calendar-m', label: 'Outlook Calendar', state: connectors.microsoft.calendar, run: () => connectMicrosoft('calendar') },
                      { key: 'word', label: 'Word', state: connectors.microsoft.word, run: () => connectMicrosoft('word') },
                      { key: 'excel', label: 'Excel', state: connectors.microsoft.excel, run: () => connectMicrosoft('excel') },
                      { key: 'powerpoint', label: 'PowerPoint', state: connectors.microsoft.powerpoint, run: () => connectMicrosoft('powerpoint') },
                      { key: 'onedrive', label: 'OneDrive', state: connectors.microsoft.onedrive, run: () => connectMicrosoft('onedrive') },
                      { key: 'teams', label: 'Teams', state: connectors.microsoft.teams, run: () => connectMicrosoft('teams') },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-lg border border-black/10 px-2 py-1.5"
                      >
                        <p className="text-sm text-black/80">{item.label}</p>
                        {item.state ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            Connected
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={item.run}
                            disabled={connectingKey.length > 0}
                            className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs text-black disabled:opacity-60"
                          >
                            <Link2 size={12} />
                            {connectingKey ? 'Connecting...' : 'Connect'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              onClick={submit}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <SendHorizonal size={14} />
              {loading ? 'Running...' : 'Send'}
            </button>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="mt-5 space-y-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-xl border p-3 ${
              message.role === 'user'
                ? 'border-sky-200 bg-sky-50'
                : 'border-light-200 bg-white'
            }`}
          >
            <p className="mb-1 text-xs uppercase tracking-wide text-black/50">{message.role}</p>
            <pre className="whitespace-pre-wrap break-words text-sm text-black">{message.text}</pre>

            {message.role === 'assistant' && message.pendingDraft ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">
                  {message.pendingDraft.provider === 'gmail' ? 'Gmail' : 'Outlook'} Draft Review
                </p>
                <p className="mt-1 text-xs text-black/70">
                  Draft only. It will never send automatically.
                </p>
                <p className="mt-2 text-xs text-black">
                  <span className="font-semibold">To:</span> {message.pendingDraft.to.join(', ')}
                </p>
                <p className="text-xs text-black">
                  <span className="font-semibold">Subject:</span> {message.pendingDraft.subject}
                </p>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-black/85">
                  {message.pendingDraft.body}
                </pre>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={message.draftState === 'creating' || message.draftState === 'created'}
                    onClick={() =>
                      setMessages((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, draftState: 'cancelled', draftError: '' }
                            : item,
                        ),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs text-black disabled:opacity-50"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={message.draftState === 'creating' || message.draftState === 'created'}
                    onClick={() => createEmailDraft(index)}
                    className="inline-flex items-center gap-1 rounded-lg bg-black px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    <Check size={12} />
                    {message.draftState === 'creating' ? 'Creating...' : 'Create Draft'}
                  </button>
                  {message.draftState === 'created' && message.draftWebLink ? (
                    <a
                      href={message.draftWebLink}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700"
                    >
                      Open Draft
                    </a>
                  ) : null}
                </div>
                {message.draftState === 'failed' && message.draftError ? (
                  <p className="mt-2 text-xs text-red-600">{message.draftError}</p>
                ) : null}
              </div>
            ) : null}

            {message.role === 'assistant' && message.downloads && message.downloads.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.downloads.map((download, downloadIndex) => {
                  const label = `${download.kind.toUpperCase()}${
                    download.origin === 'local' ? ' (Download)' : ''
                  }`;
                  if (download.webUrl) {
                    return (
                      <a
                        key={`${download.fileName}-${downloadIndex}`}
                        href={download.webUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-light-200 bg-white px-3 py-1.5 text-xs text-black hover:bg-light-100"
                      >
                        {label}
                      </a>
                    );
                  }

                  return (
                    <button
                      key={`${download.fileName}-${downloadIndex}`}
                      type="button"
                      onClick={() => {
                        if (!download.contentBase64) return;
                        const blob = new Blob([decodeBase64ToBytes(download.contentBase64)], {
                          type: download.mimeType || 'application/octet-stream',
                        });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = download.fileName;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 1200);
                      }}
                      className="rounded-lg border border-light-200 bg-white px-3 py-1.5 text-xs text-black hover:bg-light-100"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatPage;

