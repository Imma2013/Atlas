'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { MICROSOFT_LOGOS } from '@/lib/appLogos';
import type { GoogleAppKey } from '@/lib/googleScopes';
import type { MicrosoftAppKey } from '@/lib/microsoftScopes';
import {
  Check,
  ChevronDown,
  Globe,
  Link2,
  Paperclip,
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

type LocalActivityItem = {
  id: string;
  chat_id?: string;
  type: string;
  title: string;
  summary: string;
  model_used: string;
  created_at: string;
  links?: Record<string, string>;
};

type ChatSessionSnapshot = {
  chatId: string;
  includeWeb: boolean;
  input: string;
  messages: ChatMessage[];
  uploadedFiles: UploadedFile[];
};

type UploadedFile = {
  fileId: string;
  fileName: string;
  fileExtension: string;
};

let inMemoryChatSession: ChatSessionSnapshot | null = null;

const GOOGLE_CONNECTORS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_GOOGLE_CONNECTORS === 'true';
const LOCAL_ACTIVITY_KEY = 'atlasLocalActivity';
const CHAT_SESSIONS_KEY = 'atlasChatSessions';

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

const MICROSOFT_CONNECTORS: Array<{
  key: MicrosoftAppKey;
  label: string;
  icon: string;
}> = [
  { key: 'outlook', label: 'Outlook Mail', icon: MICROSOFT_LOGOS.outlook },
  { key: 'word', label: 'Word', icon: MICROSOFT_LOGOS.word },
  { key: 'excel', label: 'Excel', icon: MICROSOFT_LOGOS.excel },
  { key: 'powerpoint', label: 'PowerPoint', icon: MICROSOFT_LOGOS.powerpoint },
  { key: 'onedrive', label: 'OneDrive', icon: MICROSOFT_LOGOS.onedrive },
  { key: 'teams', label: 'Teams', icon: MICROSOFT_LOGOS.teams },
];

const GOOGLE_CONNECTORS: Array<{
  key: GoogleAppKey;
  label: string;
  icon: string;
}> = [
  {
    key: 'gmail',
    label: 'Mail',
    icon: MICROSOFT_LOGOS.outlook,
  },
  {
    key: 'calendar',
    label: 'Calendar',
    icon: MICROSOFT_LOGOS.calendar,
  },
  {
    key: 'drive',
    label: 'Drive',
    icon: MICROSOFT_LOGOS.onedrive,
  },
  {
    key: 'docs',
    label: 'Documents',
    icon: MICROSOFT_LOGOS.word,
  },
  {
    key: 'sheets',
    label: 'Spreadsheets',
    icon: MICROSOFT_LOGOS.excel,
  },
  {
    key: 'slides',
    label: 'Slides',
    icon: MICROSOFT_LOGOS.powerpoint,
  },
];

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

const cleanAssistantText = (text: string) => {
  return text
    .replace(/<use_mcp_tool>[\s\S]*?<\/use_mcp_tool>/gi, '')
    .replace(/<server_name>[\s\S]*?<\/server_name>/gi, '')
    .replace(/<tool_name>[\s\S]*?<\/tool_name>/gi, '')
    .replace(/<arguments>[\s\S]*?<\/arguments>/gi, '')
    .replace(/\bROUTER DECISION\b[\s\S]*$/i, '')
    .trim();
};

const saveLocalActivity = (item: Omit<LocalActivityItem, 'id' | 'created_at'>) => {
  if (typeof window === 'undefined') return;
  try {
    const current = JSON.parse(
      localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]',
    ) as LocalActivityItem[];
    const now = new Date().toISOString();
    const existingIndex =
      item.chat_id
        ? current.findIndex((entry) => entry.chat_id && entry.chat_id === item.chat_id)
        : -1;

    if (existingIndex >= 0) {
      const existing = current[existingIndex];
      const updated: LocalActivityItem = {
        ...existing,
        ...item,
        title: existing.title || item.title,
      };
      const nextItems = [updated, ...current.filter((_, index) => index !== existingIndex)];
      localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(nextItems.slice(0, 200)));
      return;
    }

    const next: LocalActivityItem = {
      id: crypto.randomUUID(),
      created_at: now,
      ...item,
    };
    localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify([next, ...current].slice(0, 200)));
  } catch {
    // ignore local activity cache failures
  }
};

const persistChatSession = (session: ChatSessionSnapshot) => {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_KEY);
    const current = raw ? (JSON.parse(raw) as ChatSessionSnapshot[]) : [];
    const withoutCurrent = current.filter((entry) => entry.chatId !== session.chatId);
    localStorage.setItem(
      CHAT_SESSIONS_KEY,
      JSON.stringify([session, ...withoutCurrent].slice(0, 80)),
    );
  } catch {
    // ignore local session cache failures
  }
};

const getStoredChatSession = (chatId: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_KEY);
    const current = raw ? (JSON.parse(raw) as ChatSessionSnapshot[]) : [];
    return current.find((entry) => entry.chatId === chatId) || null;
  } catch {
    return null;
  }
};

const extractLinksFromText = (text: string) => {
  const regex = /https?:\/\/[^\s)]+/g;
  const found = text.match(regex) || [];
  const links: Record<string, string> = {};
  found.slice(0, 4).forEach((url, index) => {
    links[`link${index + 1}`] = url;
  });
  return links;
};

const LinkifiedText = ({ text }: { text: string }) => {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <div className="break-all text-sm leading-6 text-black dark:text-white/88">
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={`url-${index}`}
              href={part}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sky-700 underline underline-offset-2 hover:text-sky-800"
            >
              {part}
            </a>
          );
        }
        return (
          <span key={`txt-${index}`}>
            {part.split('\n').map((line, lineIndex, arr) => (
              <span key={`line-${lineIndex}`}>
                {line}
                {lineIndex < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
};

const ChatPage = () => {
  const searchParams = useSearchParams();
  const [chatId, setChatId] = useState(
    () => inMemoryChatSession?.chatId ?? getOrCreateChatId(),
  );
  const [includeWeb, setIncludeWeb] = useState(
    () => inMemoryChatSession?.includeWeb ?? true,
  );
  const [input, setInput] = useState(() => inMemoryChatSession?.input ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => inMemoryChatSession?.messages ?? [],
  );
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(
    () => inMemoryChatSession?.uploadedFiles ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [connectingKey, setConnectingKey] = useState<string>('');
  const [connectors, setConnectors] = useState<ConnectorState>(defaultConnectorState);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshConnections = async () => {
    const microsoftToken = await getMicrosoftAccessToken();
    const googleToken = GOOGLE_CONNECTORS_ENABLED ? await getGoogleAccessToken() : null;

    if (!microsoftToken) {
      clearMicrosoftTokens();
    }
    if (GOOGLE_CONNECTORS_ENABLED && !googleToken) {
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

  useEffect(() => {
    inMemoryChatSession = {
      chatId,
      includeWeb,
      input,
      messages,
      uploadedFiles,
    };
    persistChatSession({
      chatId,
      includeWeb,
      input,
      messages,
      uploadedFiles,
    });
  }, [chatId, includeWeb, input, messages, uploadedFiles]);

  useEffect(() => {
    if (searchParams.get('fromActivity') !== '1') return;
    if (typeof window === 'undefined') return;

    const raw = sessionStorage.getItem('atlasOpenActivityItem');
    if (!raw) return;

    try {
      const item = JSON.parse(raw) as LocalActivityItem;
      const sessionChatId = item.chat_id || '';
      const storedSession = sessionChatId ? getStoredChatSession(sessionChatId) : null;

      if (storedSession) {
        setChatId(storedSession.chatId);
        setIncludeWeb(storedSession.includeWeb);
        setMessages(storedSession.messages || []);
        setInput(storedSession.input || '');
        setUploadedFiles(storedSession.uploadedFiles || []);
        setError('');
        setLoading(false);
        localStorage.setItem('atlasActiveChatId', storedSession.chatId);
        return;
      }

      const links = item.links
        ? Object.values(item.links)
            .filter((href) => typeof href === 'string' && href.length > 0)
            .slice(0, 4)
        : [];
      const assistantText = [
        item.summary,
        links.length > 0 ? `\n\nLinks:\n${links.join('\n')}` : '',
      ]
        .join('')
        .trim();

      setMessages([
        { role: 'user', text: item.title || 'Activity item' },
        { role: 'assistant', text: assistantText || 'No summary available.' },
      ]);
      if (sessionChatId) {
        setChatId(sessionChatId);
        localStorage.setItem('atlasActiveChatId', sessionChatId);
      }
      setError('');
      setLoading(false);
      setInput('');
      setUploadedFiles([]);
    } catch {
      // Ignore malformed activity payloads.
    } finally {
      sessionStorage.removeItem('atlasOpenActivityItem');
      window.history.replaceState({}, '', '/chat');
    }
  }, [searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const connectMicrosoft = async () => {
    setConnectingKey('ms:all');
    setError('');
    try {
      const nonce = crypto.randomUUID();
      const response = await fetch(
        `/api/microsoft/auth?state=${encodeURIComponent(nonce)}&app=all`,
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
    if (!GOOGLE_CONNECTORS_ENABLED) return;
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

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || uploading) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    setUploading(true);
    setError('');
    try {
      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'File upload failed');
      }

      const parsed = Array.isArray(payload?.files) ? (payload.files as UploadedFile[]) : [];
      setUploadedFiles((prev) => {
        const merged = [...prev, ...parsed];
        const unique = merged.filter(
          (item, index) =>
            merged.findIndex((ref) => ref.fileId === item.fileId) === index,
        );
        return unique.slice(0, 8);
      });
    } catch (e: any) {
      setError(e?.message || 'File upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeUploadedFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.fileId !== fileId));
  };

  const submit = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userId = getOrCreateUserId();
    localStorage.setItem('atlasActiveChatId', chatId);
    const microsoftAccessToken = await getMicrosoftAccessToken();
    const googleAccessToken = GOOGLE_CONNECTORS_ENABLED ? await getGoogleAccessToken() : null;
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
          files: uploadedFiles.map((file) => file.fileId),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Chat failed');
      }

      const rawOutput =
        typeof data?.output === 'string'
          ? data.output
          : data?.output?.answer || JSON.stringify(data?.output ?? data, null, 2);
      const output = cleanAssistantText(rawOutput);
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

      const linksFromDownloads = downloads
        .map((d: any) => d?.webUrl)
        .filter((url: string) => typeof url === 'string' && url.length > 0);
      const downloadLinks = linksFromDownloads.reduce(
        (acc: Record<string, string>, url: string, idx: number) => {
          acc[`file${idx + 1}`] = url;
          return acc;
        },
        {} as Record<string, string>,
      );
      saveLocalActivity({
        chat_id: chatId,
        type: includeWeb ? 'web_search' : 'file',
        title: query.slice(0, 120),
        summary: output,
        model_used: 'Cryzo Agent',
        links: {
          ...extractLinksFromText(output),
          ...downloadLinks,
        },
      });
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
        : await getMicrosoftAccessToken();
      if (!token) {
        throw new Error(
          isGmail
            ? 'Mail connector is not connected. Use + to connect Mail.'
            : 'Outlook is not connected. Use + to connect Outlook.',
        );
      }

      const response = await fetch(isGmail ? '/api/google/drafts' : '/api/microsoft/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isGmail ? { 'x-google-access-token': token } : { 'x-microsoft-access-token': token }),
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

  const connectorRows = useMemo(() => {
    const msRows = MICROSOFT_CONNECTORS.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      state: connectors.microsoft[item.key],
      run: () => connectMicrosoft(),
      provider: 'ms' as const,
    }));

    if (!GOOGLE_CONNECTORS_ENABLED) return msRows;

    const gRows = GOOGLE_CONNECTORS.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      state: connectors.google[item.key],
      run: () => connectGoogle(item.key),
      provider: 'g' as const,
    }));

    return [...msRows, ...gRows];
  }, [connectors]);

  const getDownloadIcon = (download: NonNullable<ChatMessage['downloads']>[number]) => {
    if (download.origin === 'google') {
      if (download.kind === 'word') {
        return MICROSOFT_LOGOS.word;
      }
      if (download.kind === 'excel') {
        return MICROSOFT_LOGOS.excel;
      }
      return MICROSOFT_LOGOS.powerpoint;
    }

    if (download.kind === 'word') return MICROSOFT_LOGOS.word;
    if (download.kind === 'excel') return MICROSOFT_LOGOS.excel;
    return MICROSOFT_LOGOS.powerpoint;
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-5.5rem)] max-w-none flex-col overflow-x-hidden px-1.5 py-1.5 md:h-[calc(100vh-1rem)] md:max-w-6xl md:px-6 md:py-5">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#eef4ff_0%,#f8fbff_32%,#ffffff_68%)] p-2 shadow-[0_24px_80px_-48px_rgba(18,48,90,0.55)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,#182235_0%,#111825_35%,#090d16_70%)] dark:shadow-[0_24px_80px_-48px_rgba(0,0,0,0.92)] md:rounded-[30px] md:p-5">
        <div className="pointer-events-none absolute -left-24 -top-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/15" />
        <div className="pointer-events-none absolute -bottom-20 -right-24 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
        <div className="relative mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-black/55 dark:text-white/55">
            Cryzo Workspace
          </p>
          <p className="text-[11px] text-black/55 dark:text-white/55">
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </p>
        </div>

        {messages.length === 0 ? (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.02] md:rounded-3xl">
            <div className="text-center">
              <h1 className="font-['PP_Editorial',serif] text-5xl leading-[0.94] text-black dark:text-white md:text-6xl">
                What can I do for you?
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-black/65 dark:text-white/65">
                Unified assistant for Outlook, OneDrive, Word, Excel, PowerPoint, and Teams.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto rounded-2xl border border-black/10 bg-white/70 p-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.02] md:rounded-3xl md:p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex min-w-0 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`w-full max-w-[98%] overflow-hidden rounded-2xl border px-3 py-2.5 md:max-w-[84%] md:px-4 md:py-3 ${
                      message.role === 'user'
                        ? 'border-cyan-300/50 bg-cyan-50/90 dark:border-cyan-500/35 dark:bg-cyan-500/10'
                        : 'border-black/10 bg-white/92 dark:border-white/10 dark:bg-white/[0.03]'
                    }`}
                  >
                    <p className="mb-1 text-xs uppercase tracking-wide text-black/50 dark:text-white/55">
                      {message.role}
                    </p>
                    <LinkifiedText text={message.text} />

                    {message.role === 'assistant' && message.pendingDraft ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-300/30 dark:bg-amber-500/10">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-200">
                          {message.pendingDraft.provider === 'gmail' ? 'Mail' : 'Outlook'} Draft Review
                        </p>
                        <p className="mt-1 text-xs text-black/70 dark:text-white/75">
                          Draft only. It will never send automatically.
                        </p>
                        <p className="mt-2 text-xs text-black dark:text-white/85">
                          <span className="font-semibold">To:</span> {message.pendingDraft.to.join(', ')}
                        </p>
                        <p className="text-xs text-black dark:text-white/85">
                          <span className="font-semibold">Subject:</span> {message.pendingDraft.subject}
                        </p>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 text-xs text-black/85 dark:bg-black/40 dark:text-white/85">
                          {message.pendingDraft.body}
                        </pre>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={message.draftState === 'creating' || message.draftState === 'created'}
                            onClick={() =>
                              setMessages((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, draftState: 'cancelled', draftError: '' } : item,
                                ),
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs text-black disabled:opacity-50 dark:border-white/20 dark:bg-black/30 dark:text-white"
                          >
                            <X size={12} />
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={message.draftState === 'creating' || message.draftState === 'created'}
                            onClick={() => createEmailDraft(index)}
                            className="inline-flex items-center gap-1 rounded-lg bg-black px-2.5 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
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
                          const label = `${download.kind.toUpperCase()}${download.origin === 'local' ? ' (Download)' : ''}`;
                          if (download.webUrl) {
                            return (
                              <a
                                key={`${download.fileName}-${downloadIndex}`}
                                href={download.webUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-sky-700 underline underline-offset-2 hover:bg-light-100 dark:border-white/20 dark:bg-white/[0.04]"
                              >
                                <img
                                  src={getDownloadIcon(download)}
                                  alt={`${download.kind} logo`}
                                  className="h-3.5 w-3.5 rounded-sm"
                                />
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
                              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-black hover:bg-light-100 dark:border-white/20 dark:bg-white/[0.04] dark:text-white"
                            >
                              <img
                                src={getDownloadIcon(download)}
                                alt={`${download.kind} logo`}
                                className="h-3.5 w-3.5 rounded-sm"
                              />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {loading ? <p className="text-sm text-black/60 dark:text-white/60">Cryzo Agent is working...</p> : null}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        <div className="sticky bottom-0 mt-2 shrink-0 rounded-2xl border border-black/10 bg-white/90 p-2.5 backdrop-blur-md shadow-[0_18px_40px_-30px_rgba(0,0,0,0.65)] dark:border-white/10 dark:bg-black/55 md:mt-3 md:rounded-3xl md:p-3">
          {uploadedFiles.length > 0 ? (
            <div className="mb-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/15 dark:bg-white/[0.03]">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-black/55 dark:text-white/55">
                Attached {uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'}
              </p>
              <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <span
                  key={file.fileId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-2.5 py-1 text-[11px] text-black/80 dark:border-white/20 dark:bg-black/20 dark:text-white/85"
                >
                  <Paperclip size={11} />
                  {file.fileName}
                  <button
                    type="button"
                    onClick={() => removeUploadedFile(file.fileId)}
                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20"
                    aria-label={`Remove ${file.fileName}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              </div>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/png,image/jpg,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => uploadFiles(event.target.files)}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Assign a task or ask anything"
            className="w-full resize-none rounded-xl border-none bg-transparent px-2 py-2 text-sm text-black outline-none placeholder:text-black/45 dark:text-white dark:placeholder:text-white/40"
          />
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="relative flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-black/75 disabled:opacity-60 dark:border-white/20 dark:bg-white/[0.03] dark:text-white/80"
              >
                <Plus size={13} />
                {uploading ? 'Uploading...' : 'Add Files'}
              </button>
              <button
                type="button"
                onClick={() => setConnectorOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-black/75 dark:border-white/20 dark:bg-white/[0.03] dark:text-white/80"
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
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-400/40 dark:bg-cyan-500/15 dark:text-cyan-200'
                    : 'border-black/10 bg-white text-black/70 dark:border-white/20 dark:bg-white/[0.03] dark:text-white/75'
                }`}
              >
                <Globe size={13} />
                Web {includeWeb ? 'On' : 'Off'}
              </button>

              {connectorOpen ? (
                <div className="absolute bottom-10 left-0 z-30 w-[330px] rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#0f1522]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-black/45 dark:text-white/45">
                    Connectors
                  </p>
                  <div className="max-h-72 space-y-2 overflow-auto pr-1">
                    {connectorRows.map((item) => (
                      <div
                        key={`${item.provider}:${item.key}`}
                        className="flex items-center justify-between rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <img src={item.icon} alt={`${item.label} icon`} className="h-4 w-4 rounded-sm" />
                          <p className="text-sm text-black/80 dark:text-white/80">{item.label}</p>
                        </div>
                        {item.state ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            Connected
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={item.run}
                            disabled={connectingKey.length > 0}
                            className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs text-black disabled:opacity-60 dark:border-white/20 dark:text-white"
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
              aria-label={loading ? 'Running request' : 'Send message'}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              <SendHorizonal size={14} />
            </button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
