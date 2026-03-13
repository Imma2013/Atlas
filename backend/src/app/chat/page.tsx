'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Sparkles,
  SendHorizonal,
  X,
} from 'lucide-react';
import CryzoLogo from '@/components/CryzoLogo';

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
  webResults?: Array<{
    name: string;
    url: string;
    snippet: string;
    reason?: string;
  }>;
  webFollowUps?: string[];
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
    driveItemId?: string;
    origin: 'microsoft' | 'google' | 'local';
    previewText?: string;
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
  initialContent?: string;
};

type DownloadPreviewState = {
  fileName: string;
  kind: 'word' | 'excel' | 'powerpoint';
  sourceUrl?: string;
  blobUrl?: string;
  embedUrl?: string;
  mimeType: string;
  previewText?: string;
  origin: 'microsoft' | 'google' | 'local';
  citations?: Array<{
    name: string;
    url: string;
    snippet: string;
    reason?: string;
  }>;
  relatedArtifacts?: Array<{
    kind: 'word' | 'excel' | 'powerpoint';
    fileName: string;
  }>;
};

type ExecutionLogEntry = {
  id: string;
  level: 'info' | 'success' | 'error';
  message: string;
  at: string;
};

let inMemoryChatSession: ChatSessionSnapshot | null = null;

const GOOGLE_CONNECTORS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_GOOGLE_CONNECTORS === 'true';
const LOCAL_ACTIVITY_KEY = 'atlasLocalActivity';
const CHAT_SESSIONS_KEY = 'atlasChatSessions';
const ACTIVITY_SELECTION_KEY = 'atlasOpenActivityItem';

const inferMicrosoftAccountType = (profile: { mail?: string; userPrincipalName?: string } | null) => {
  const mail = String(profile?.mail || '').trim().toLowerCase();
  const upn = String(profile?.userPrincipalName || '').trim().toLowerCase();
  const sample = mail || upn;
  if (!sample) return 'unknown' as const;
  if (
    sample.endsWith('@outlook.com') ||
    sample.endsWith('@hotmail.com') ||
    sample.endsWith('@live.com') ||
    sample.endsWith('@msn.com') ||
    upn.includes('live.com#')
  ) {
    return 'personal' as const;
  }
  return 'work' as const;
};

const defaultConnectorState: ConnectorState = {
  microsoft: {
    outlook: false,
    calendar: false,
    onedrive: false,
    sharepoint: false,
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
  { key: 'sharepoint', label: 'SharePoint', icon: MICROSOFT_LOGOS.sharepoint },
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
    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6 text-black dark:text-white/88">
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

const renderGeneratedPreview = (preview: DownloadPreviewState) => {
  const raw = String(preview.previewText || '').trim();
  if (!raw) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-black/20 bg-white/80 p-6 text-sm text-black/65 dark:border-white/20 dark:bg-black/35 dark:text-white/70">
        Preview is unavailable for this file here. Use Download to open the full file.
      </div>
    );
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nodes: ReactNode[] = [];

  const renderDefaultText = () => {
    let paragraph: string[] = [];
    let listItems: string[] = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      nodes.push(
        <p key={`p-${nodes.length}`} className="text-sm leading-7 text-black/80 dark:text-white/85">
          {paragraph.join(' ')}
        </p>,
      );
      paragraph = [];
    };
    const flushList = () => {
      if (!listItems.length) return;
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="list-disc space-y-1 pl-5 text-sm text-black/80 dark:text-white/85">
          {listItems.map((item, idx) => (
            <li key={`li-${nodes.length}-${idx}`}>{item}</li>
          ))}
        </ul>,
      );
      listItems = [];
    };
    for (const line of lines) {
      if (/^#{1,6}\s+/.test(line)) {
        flushParagraph();
        flushList();
        const heading = line.replace(/^#{1,6}\s+/, '');
        nodes.push(
          <h3 key={`h-${nodes.length}`} className="text-base font-semibold text-black dark:text-white md:text-lg">
            {heading}
          </h3>,
        );
        continue;
      }
      if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        flushParagraph();
        listItems.push(line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim());
        continue;
      }
      if (line === '---') {
        flushParagraph();
        flushList();
        nodes.push(<hr key={`hr-${nodes.length}`} className="border-black/10 dark:border-white/15" />);
        continue;
      }
      flushList();
      paragraph.push(line);
    }
    flushParagraph();
    flushList();
  };

  if (preview.kind === 'powerpoint') {
    const chunks = raw
      .split(/(?=Slide\s+\d+\s*:)/gi)
      .map((item) => item.trim())
      .filter(Boolean);
    if (chunks.length > 0) {
      nodes.push(
        <div key="slides-grid" className="grid gap-3 md:grid-cols-2">
          {chunks.slice(0, 8).map((chunk, idx) => {
            const linesInChunk = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const titleLine = linesInChunk[0] || `Slide ${idx + 1}`;
            const bullets = linesInChunk
              .slice(1)
              .map((line) => line.replace(/^[-*]\s+/, '').trim())
              .filter(Boolean)
              .slice(0, 5);
            return (
              <div key={`slide-${idx}`} className="rounded-xl border border-black/10 bg-gradient-to-br from-[#071a3d] to-[#0f2f66] p-4 text-white shadow-sm">
                <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/90">Slide {idx + 1}</p>
                <h4 className="mt-1 text-sm font-semibold leading-snug">{titleLine.replace(/^Slide\s+\d+\s*:/i, '').trim()}</h4>
                <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-white/90">
                  {bullets.map((item, bulletIdx) => (
                    <li key={`slide-item-${idx}-${bulletIdx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>,
      );
    } else {
      renderDefaultText();
    }
  } else if (preview.kind === 'excel') {
    const tableRows = lines
      .map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean))
      .filter((row) => row.length >= 3)
      .slice(0, 11);
    if (tableRows.length >= 2) {
      const [header, ...rows] = tableRows;
      nodes.push(
        <div key="table-wrap" className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:bg-[#0d1320]">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-black/[0.04] dark:bg-white/[0.06]">
              <tr>
                {header.map((cell, idx) => (
                  <th key={`th-${idx}`} className="px-3 py-2 font-semibold text-black dark:text-white">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={`tr-${rowIdx}`} className="border-t border-black/10 dark:border-white/10">
                  {row.map((cell, cellIdx) => (
                    <td key={`td-${rowIdx}-${cellIdx}`} className="px-3 py-2 text-black/80 dark:text-white/85">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      const otherLines = lines.filter((line) => !line.includes('|'));
      if (otherLines.length > 0) {
        nodes.push(
          <p key="excel-note" className="text-sm leading-7 text-black/75 dark:text-white/80">
            {otherLines.slice(0, 3).join(' ')}
          </p>,
        );
      }
    } else {
      renderDefaultText();
    }
  } else {
    renderDefaultText();
  }

  return (
    <div className="h-full overflow-y-auto rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-[#0d1320]">
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/50 dark:text-white/50">
          {preview.kind} quick preview
        </p>
        {nodes}
      </div>
    </div>
  );
};

const renderPreviewDataRoom = (preview: DownloadPreviewState) => {
  const citations = (preview.citations || []).slice(0, 8);
  const related = (preview.relatedArtifacts || []).slice(0, 6);
  return (
    <aside className="h-full overflow-y-auto rounded-xl border border-black/10 bg-white/90 p-3 dark:border-white/10 dark:bg-black/25">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/55 dark:text-white/60">
        Data Room
      </p>
      <div className="mt-2 space-y-2">
        <div className="rounded-lg border border-black/10 bg-black/[0.03] p-2 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[10px] uppercase tracking-[0.1em] text-black/45 dark:text-white/55">Artifact</p>
          <p className="mt-1 text-xs font-semibold text-black dark:text-white">{preview.fileName}</p>
          <p className="text-[11px] text-black/60 dark:text-white/65">
            Mode: {preview.kind.toUpperCase()} canvas
          </p>
        </div>
        {related.length > 0 ? (
          <div className="rounded-lg border border-black/10 p-2 dark:border-white/10">
            <p className="text-[10px] uppercase tracking-[0.1em] text-black/45 dark:text-white/55">Linked Files</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {related.map((item, idx) => (
                <span
                  key={`${item.fileName}-${idx}`}
                  className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] text-black/75 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80"
                >
                  {item.kind.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-lg border border-black/10 p-2 dark:border-white/10">
          <p className="text-[10px] uppercase tracking-[0.1em] text-black/45 dark:text-white/55">
            Sources ({citations.length})
          </p>
          <div className="mt-2 space-y-2">
            {citations.length > 0 ? (
              citations.map((source, idx) => (
                <a
                  key={`${source.url}-${idx}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-black/10 bg-white p-2 text-xs transition hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-cyan-400/35"
                >
                  <p className="line-clamp-2 font-semibold text-black dark:text-white">{source.name}</p>
                  {source.reason ? (
                    <p className="mt-1 line-clamp-2 text-black/65 dark:text-white/70">Why: {source.reason}</p>
                  ) : null}
                </a>
              ))
            ) : (
              <p className="text-[11px] text-black/60 dark:text-white/65">
                No citations captured for this artifact run.
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
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
  const [microsoftAccountType, setMicrosoftAccountType] = useState<'unknown' | 'personal' | 'work'>('unknown');
  const [usage, setUsage] = useState<{
    tier: string;
    used: number;
    limit: number | null;
    remaining: number | null;
    unlimited: boolean;
  } | null>(null);
  const [downloadPreview, setDownloadPreview] = useState<DownloadPreviewState | null>(null);
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const appendExecutionLog = (level: ExecutionLogEntry['level'], message: string) => {
    const entry: ExecutionLogEntry = {
      id:
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      level,
      message,
      at: new Date().toISOString(),
    };
    setExecutionLog((prev) => [entry, ...prev].slice(0, 120));
  };

  useEffect(() => {
    return () => {
      if (downloadPreview?.blobUrl) {
        URL.revokeObjectURL(downloadPreview.blobUrl);
      }
    };
  }, [downloadPreview]);
  const starterPrompts = [
    'Create calendar events from this uploaded syllabus.',
    'Summarize my latest emails and draft replies.',
    'Build a PowerPoint on elephants and add relevant images.',
    'Turn this file into a task plan with deadlines.',
  ];

  const refreshConnections = async () => {
    const microsoftToken = await getMicrosoftAccessToken();
    const googleToken = GOOGLE_CONNECTORS_ENABLED ? await getGoogleAccessToken() : null;

    if (!microsoftToken) {
      clearMicrosoftTokens();
      setMicrosoftAccountType('unknown');
    }
    if (GOOGLE_CONNECTORS_ENABLED && !googleToken) {
      clearGoogleTokens();
    }

    setConnectors({
      microsoft: {
        outlook: Boolean(microsoftToken) && hasMicrosoftAppScopes('outlook'),
        calendar: Boolean(microsoftToken) && hasMicrosoftAppScopes('calendar'),
        onedrive: Boolean(microsoftToken) && hasMicrosoftAppScopes('onedrive'),
        sharepoint: Boolean(microsoftToken) && hasMicrosoftAppScopes('sharepoint'),
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

    if (microsoftToken) {
      try {
        const response = await fetch('/api/microsoft/me', {
          headers: { 'x-microsoft-access-token': microsoftToken },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.profile) {
          setMicrosoftAccountType(inferMicrosoftAccountType(payload.profile));
        }
      } catch {
        // ignore
      }
    }
  };

  const refreshUsage = async () => {
    try {
      const userId = getOrCreateUserId();
      if (!userId) return;
      const res = await fetch(`/api/usage?userId=${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return;
      setUsage({
        tier: String(data.tier || 'free'),
        used: Number(data.used || 0),
        limit: data.limit === null ? null : Number(data.limit),
        remaining: data.remaining === null ? null : Number(data.remaining),
        unlimited: Boolean(data.unlimited),
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshConnections();
    refreshUsage();
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

    let raw =
      sessionStorage.getItem(ACTIVITY_SELECTION_KEY) ||
      localStorage.getItem(ACTIVITY_SELECTION_KEY);

    if (!raw) {
      const activityId = searchParams.get('activityId');
      if (activityId) {
        try {
          const activity = JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]') as LocalActivityItem[];
          const found = activity.find((item) => item.id === activityId);
          if (found) raw = JSON.stringify(found);
        } catch {
          raw = null;
        }
      }
    }
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
      sessionStorage.removeItem(ACTIVITY_SELECTION_KEY);
      localStorage.removeItem(ACTIVITY_SELECTION_KEY);
      window.history.replaceState({}, '', '/chat');
    }
  }, [searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const connectMicrosoft = async (app: MicrosoftAppKey | 'all' = 'all') => {
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
    const artifactContext = messages
      .slice()
      .reverse()
      .flatMap((message) => (message.role === 'assistant' ? message.downloads || [] : []))
      .map((download) => ({
        kind: download.kind,
        fileName: download.fileName,
        webUrl: download.webUrl || '',
        driveItemId: download.driveItemId || '',
        origin: download.origin,
      }))
      .filter((artifact, index, arr) => {
        const key = `${artifact.kind}:${artifact.driveItemId || artifact.webUrl}:${artifact.origin}`;
        return arr.findIndex((item) => `${item.kind}:${item.driveItemId || item.webUrl}:${item.origin}` === key) === index;
      })
      .slice(0, 12);

    setError('');
    setLoading(true);
    appendExecutionLog('info', 'Dispatching unified chat task');
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setInput('');
    saveLocalActivity({
      chat_id: chatId,
      type: includeWeb ? 'web_search' : 'file',
      title: query.slice(0, 120),
      summary: 'Running...',
      model_used: 'Cryzo',
      links: {},
    });

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
          uploadedFileContext: uploadedFiles.map((file) => ({
            fileName: file.fileName,
            initialContent: file.initialContent || '',
          })),
          artifactContext,
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
      const downloads = Array.isArray(data?.downloads)
        ? data.downloads
            .map((item: any) => ({
              kind:
                item?.kind === 'word' || item?.kind === 'excel' || item?.kind === 'powerpoint'
                  ? item.kind
                  : 'word',
              fileName: String(item?.fileName || 'Atlas file'),
              mimeType: String(item?.mimeType || 'application/octet-stream'),
              contentBase64:
                typeof item?.contentBase64 === 'string' && item.contentBase64.length > 0
                  ? item.contentBase64
                  : undefined,
              webUrl:
                typeof item?.webUrl === 'string' && item.webUrl.length > 0 ? item.webUrl : undefined,
              driveItemId:
                typeof item?.driveItemId === 'string' && item.driveItemId.length > 0
                  ? item.driveItemId
                  : undefined,
              origin:
                item?.origin === 'microsoft' || item?.origin === 'google' || item?.origin === 'local'
                  ? item.origin
                  : 'local',
              previewText:
                typeof item?.previewText === 'string' && item.previewText.trim().length > 0
                  ? item.previewText.trim()
                  : undefined,
            }))
            .slice(0, 8)
        : [];
      const webResults = Array.isArray(data?.webResults)
        ? data.webResults
            .map((item: any) => ({
              name: String(item?.name || '').trim(),
              url: String(item?.url || '').trim(),
              snippet: String(item?.snippet || '').trim(),
              reason: String(item?.reason || '').trim(),
            }))
            .filter((item: any) => item.name && item.url)
            .slice(0, 10)
        : [];
      const webFollowUps = Array.isArray(data?.webFollowUps)
        ? data.webFollowUps
            .map((item: any) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 8)
        : [];
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
          webResults,
          webFollowUps,
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
        model_used: 'Cryzo',
        links: {
          ...extractLinksFromText(output),
          ...downloadLinks,
        },
      });
      refreshUsage();
      appendExecutionLog(
        'success',
        `Task completed${downloads.length > 0 ? ` with ${downloads.length} artifact(s)` : ''}`,
      );
    } catch (e: any) {
      const message = e?.message || 'Chat request failed';
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${message}` }]);
      saveLocalActivity({
        chat_id: chatId,
        type: includeWeb ? 'web_search' : 'file',
        title: query.slice(0, 120),
        summary: `Error: ${message}`,
        model_used: 'Cryzo',
        links: {},
      });
      appendExecutionLog('error', `Task failed: ${message}`);
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
    appendExecutionLog('info', 'Creating draft in connected mailbox');

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
      appendExecutionLog('success', 'Draft created successfully');
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, draftState: 'failed', draftError: e?.message || 'Draft creation failed' }
            : item,
        ),
      );
      appendExecutionLog('error', e?.message || 'Draft creation failed');
    }
  };

  const connectorRows = useMemo(() => {
    const msRows = MICROSOFT_CONNECTORS.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      state: connectors.microsoft[item.key],
      blocked:
        microsoftAccountType !== 'work' &&
        (item.key === 'sharepoint' || item.key === 'teams'),
      run: () => {
        if (
          microsoftAccountType !== 'work' &&
          (item.key === 'sharepoint' || item.key === 'teams')
        ) {
          setError(
            'SharePoint and Teams require a work/school Microsoft account. Connect Outlook/OneDrive first with your work account, then reconnect these apps.',
          );
          return;
        }
        connectMicrosoft(item.key);
      },
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
  }, [connectors, microsoftAccountType]);
  const connectedMicrosoftCount = useMemo(
    () => Object.values(connectors.microsoft).filter(Boolean).length,
    [connectors.microsoft],
  );
  const usagePercent = useMemo(() => {
    if (!usage || usage.unlimited || !usage.limit || usage.limit <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((usage.used / usage.limit) * 100)));
  }, [usage]);
  const creditsLow = useMemo(() => {
    if (!usage || usage.unlimited || usage.remaining == null) return false;
    return usage.remaining <= 10;
  }, [usage]);

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

  const openDownloadPreview = async (
    download: NonNullable<ChatMessage['downloads']>[number],
    context?: {
      webResults?: ChatMessage['webResults'];
      downloads?: ChatMessage['downloads'];
    },
  ) => {
    appendExecutionLog('info', `Opening preview for ${download.fileName}`);
    const citations = (context?.webResults || []).slice(0, 8);
    const relatedArtifacts = (context?.downloads || [])
      .map((item) => ({ kind: item.kind, fileName: item.fileName }))
      .slice(0, 8);

    let embedUrl = '';
    if (download.origin === 'microsoft' && download.driveItemId) {
      try {
        const token = await getMicrosoftAccessToken();
        if (token) {
          const previewRes = await fetch(
            `/api/microsoft/files?id=${encodeURIComponent(download.driveItemId)}&preview=1`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          if (previewRes.ok) {
            const payload = await previewRes.json().catch(() => ({}));
            embedUrl = String(payload?.embedUrl || '').trim();
          }
        }
      } catch {
        // best-effort only
        appendExecutionLog('error', `Graph preview lookup failed for ${download.fileName}`);
      }
    }

    if (download.webUrl) {
      setDownloadPreview({
        fileName: download.fileName,
        kind: download.kind,
        sourceUrl: download.webUrl,
        embedUrl,
        mimeType: download.mimeType || 'application/octet-stream',
        previewText: download.previewText,
        origin: download.origin,
        citations,
        relatedArtifacts,
      });
      return;
    }

    if (!download.contentBase64) return;
    const blob = new Blob([decodeBase64ToBytes(download.contentBase64)], {
      type: download.mimeType || 'application/octet-stream',
    });
    const blobUrl = URL.createObjectURL(blob);
    setDownloadPreview({
      fileName: download.fileName,
      kind: download.kind,
      blobUrl,
      embedUrl,
      mimeType: download.mimeType || 'application/octet-stream',
      previewText: download.previewText,
      origin: download.origin,
      citations,
      relatedArtifacts,
    });
  };

  const resolvePreviewFrameUrl = (preview: DownloadPreviewState | null) => {
    if (!preview) return '';
    if (preview.embedUrl) return preview.embedUrl;
    const directUrl = preview.sourceUrl || preview.blobUrl || '';
    if (!directUrl) return '';
    if (preview.kind === 'word' && preview.mimeType.includes('text/html')) return directUrl;
    if (preview.sourceUrl && /^https?:\/\//i.test(preview.sourceUrl)) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(preview.sourceUrl)}`;
    }
    return '';
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-5.5rem)] max-w-none flex-col overflow-x-clip px-1.5 py-1.5 md:h-[calc(100vh-1rem)] md:max-w-7xl md:px-6 md:py-5">
      <div className="relative flex h-full flex-col overflow-x-clip overflow-y-hidden rounded-[24px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#e6f4ff_0%,#f6fbff_35%,#ffffff_72%)] p-2 shadow-[0_28px_90px_-56px_rgba(15,41,82,0.65)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,#162034_0%,#101827_38%,#090d16_76%)] dark:shadow-[0_24px_80px_-48px_rgba(0,0,0,0.92)] md:rounded-[30px] md:p-5">
        <div className="pointer-events-none absolute -left-24 -top-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/15" />
        <div className="pointer-events-none absolute -bottom-20 -right-24 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
        <div className="relative mb-3 flex items-center justify-between gap-2">
          <CryzoLogo compact />
          <p className="text-[11px] text-black/55 dark:text-white/55">
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </p>
        </div>

        {messages.length === 0 ? (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.02] md:rounded-3xl">
            <div className="w-full max-w-3xl text-center">
              <p className="mx-auto inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/85 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-black/70 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/70">
                <Sparkles size={12} />
                Workspace + Web Agent
              </p>
              <h1 className="mt-6 font-['PP_Editorial',serif] text-5xl leading-[0.94] text-black dark:text-white md:text-6xl">
                What can I do for you?
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-black/65 dark:text-white/65">
                Unified assistant for Outlook, OneDrive, Word, Excel, PowerPoint, and Teams.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-xl border border-black/10 bg-white/85 px-3 py-2 text-xs text-black/80 transition hover:border-cyan-300 hover:bg-cyan-50/80 dark:border-white/12 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-500/10"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-3 overflow-hidden md:grid-cols-[minmax(0,1fr)_250px]">
            <div className="overflow-y-auto rounded-2xl border border-black/10 bg-white/70 p-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.02] md:rounded-3xl md:p-4">
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
                    {message.role === 'assistant' && message.webResults && message.webResults.length > 0 ? (
                      <div className="mt-1 grid gap-3 md:grid-cols-[minmax(0,1fr)_290px]">
                        <div className="min-w-0">
                          <LinkifiedText text={message.text} />
                          {message.webFollowUps && message.webFollowUps.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {message.webFollowUps.slice(0, 5).map((followUp, followUpIndex) => (
                                <button
                                  key={`${followUp}-${followUpIndex}`}
                                  type="button"
                                  onClick={() => setInput(followUp)}
                                  className="rounded-full border border-black/12 bg-white px-2.5 py-1 text-[11px] text-black/75 hover:bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                                >
                                  {followUp}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <aside className="rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/55 dark:text-white/60">
                            Sources ({message.webResults.slice(0, 8).length})
                          </p>
                          <div className="space-y-2">
                            {message.webResults.slice(0, 8).map((source, sourceIndex) => (
                              <a
                                key={`${source.url}-${sourceIndex}`}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-lg border border-black/10 bg-white p-2 text-xs text-black/80 transition hover:-translate-y-[1px] hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-500/10"
                              >
                                <p className="line-clamp-2 font-semibold">{source.name}</p>
                                {source.reason ? (
                                  <p className="mt-1 line-clamp-2 text-black/70 dark:text-white/70">
                                    Why this link: {source.reason}
                                  </p>
                                ) : null}
                                {source.snippet ? (
                                  <p className="mt-1 line-clamp-3 text-black/65 dark:text-white/65">
                                    {source.snippet}
                                  </p>
                                ) : null}
                              </a>
                            ))}
                          </div>
                        </aside>
                      </div>
                    ) : (
                      <LinkifiedText text={message.text} />
                    )}

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
                              <button
                                key={`${download.fileName}-${downloadIndex}`}
                                type="button"
                                onClick={() =>
                                  openDownloadPreview(download, {
                                    webResults: message.webResults,
                                    downloads: message.downloads,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-sky-700 underline underline-offset-2 hover:bg-light-100 dark:border-white/20 dark:bg-white/[0.04]"
                              >
                                <img
                                  src={getDownloadIcon(download)}
                                  alt={`${download.kind} logo`}
                                  className="h-3.5 w-3.5 rounded-sm"
                                />
                                Preview {label}
                              </button>
                            );
                          }

                          return (
                            <button
                              key={`${download.fileName}-${downloadIndex}`}
                              type="button"
                              onClick={() =>
                                openDownloadPreview(download, {
                                  webResults: message.webResults,
                                  downloads: message.downloads,
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-black hover:bg-light-100 dark:border-white/20 dark:bg-white/[0.04] dark:text-white"
                            >
                              <img
                                src={getDownloadIcon(download)}
                                alt={`${download.kind} logo`}
                                className="h-3.5 w-3.5 rounded-sm"
                              />
                              Preview {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {loading ? <p className="text-sm text-black/60 dark:text-white/60">Cryzo is working...</p> : null}
              <div ref={messagesEndRef} />
            </div>
            </div>
            <aside className="hidden overflow-y-auto rounded-3xl border border-black/10 bg-white/75 p-3 backdrop-blur md:block dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/60 dark:text-white/60">
                Session Status
              </p>
              <div className="mt-2 space-y-2">
                <div className="rounded-xl border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/25">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-black/55 dark:text-white/55">Messages</p>
                  <p className="mt-1 text-xl font-semibold text-black dark:text-white">{messages.length}</p>
                </div>
                <div className="rounded-xl border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/25">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-black/55 dark:text-white/55">Connected Apps</p>
                  <p className="mt-1 text-xl font-semibold text-black dark:text-white">{connectedMicrosoftCount}/8</p>
                </div>
                <div className="rounded-xl border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/25">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-black/55 dark:text-white/55">Web Search</p>
                  <p className="mt-1 text-sm font-semibold text-black dark:text-white">{includeWeb ? 'Enabled' : 'Disabled'}</p>
                </div>
                {usage ? (
                  <div className="rounded-xl border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/25">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-black/55 dark:text-white/55">Credits</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-black dark:text-white">
                      {usage.tier} - {usage.unlimited ? 'Unlimited' : `${usage.remaining} left`}
                    </p>
                    {!usage.unlimited && usage.limit ? (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                            style={{ width: `${Math.max(4, usagePercent)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-black/60 dark:text-white/60">
                          {usage.used}/{usage.limit} used this month
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 rounded-xl border border-black/10 bg-gradient-to-br from-cyan-50 to-sky-100 p-3 dark:border-white/10 dark:from-cyan-500/10 dark:to-sky-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700 dark:text-cyan-200">
                  Workflow Tips
                </p>
                <ul className="mt-2 space-y-1 text-xs text-black/75 dark:text-white/80">
                  <li>Ask for files in one prompt: Word + Excel + PowerPoint.</li>
                  <li>For drafts, include a recipient email explicitly.</li>
                  <li>For calendars, include exact dates and times.</li>
                </ul>
              </div>
              <div className="mt-3 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/60 dark:text-white/60">
                  Execution Log
                </p>
                <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {executionLog.length > 0 ? (
                    executionLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-black/10 bg-black/[0.02] px-2 py-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <p
                          className={`font-medium ${
                            entry.level === 'error'
                              ? 'text-red-600 dark:text-red-300'
                              : entry.level === 'success'
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-black/75 dark:text-white/80'
                          }`}
                        >
                          {entry.message}
                        </p>
                        <p className="mt-0.5 text-[10px] text-black/45 dark:text-white/45">
                          {new Date(entry.at).toLocaleTimeString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-black/55 dark:text-white/60">
                      No executions yet for this session.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}

        <div className="sticky bottom-0 mt-2 shrink-0 rounded-2xl border border-black/10 bg-white/95 p-2.5 backdrop-blur-md shadow-[0_24px_54px_-30px_rgba(2,18,43,0.55)] dark:border-white/10 dark:bg-black/60 md:mt-3 md:rounded-3xl md:p-3">
          {usage ? (
            <div
              className={`mb-2 rounded-xl border px-2.5 py-1.5 text-xs ${
                creditsLow
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100'
                  : 'border-black/10 bg-white/70 text-black/70 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/75'
              }`}
            >
              Plan: <span className="font-semibold capitalize">{usage.tier}</span>
              {usage.unlimited ? ' - Unlimited credits' : ` - ${usage.remaining} credits left`}
            </div>
          ) : null}
          {uploadedFiles.length > 0 ? (
            <div className="mb-2 rounded-xl border border-black/10 bg-black/[0.02] p-2.5 dark:border-white/15 dark:bg-white/[0.03]">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-black/55 dark:text-white/55">
                Attached {uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'}
              </p>
              <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <span
                  key={file.fileId}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-black/15 bg-white px-2.5 py-1 text-[11px] text-black/80 dark:border-white/20 dark:bg-black/20 dark:text-white/85"
                >
                  <Paperclip size={11} />
                  <span className="max-w-[44vw] truncate sm:max-w-[240px]">{file.fileName}</span>
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
            className="min-w-0 w-full resize-none rounded-xl border-none bg-transparent px-2 py-2 text-sm leading-6 text-black outline-none placeholder:text-black/45 dark:text-white dark:placeholder:text-white/40"
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
                <div className="absolute bottom-10 left-0 z-30 w-[calc(100vw-2.5rem)] max-w-[330px] rounded-2xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#0f1522]">
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
                        ) : item.provider === 'ms' && (item as any).blocked ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                            Work account only
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
      {downloadPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f1522]">
            <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <img
                  src={
                    downloadPreview.kind === 'word'
                      ? MICROSOFT_LOGOS.word
                      : downloadPreview.kind === 'excel'
                        ? MICROSOFT_LOGOS.excel
                        : MICROSOFT_LOGOS.powerpoint
                  }
                  alt={`${downloadPreview.kind} icon`}
                  className="h-5 w-5 rounded-sm"
                />
                <p className="text-sm font-medium text-black dark:text-white">{downloadPreview.fileName}</p>
              </div>
              <div className="flex items-center gap-2">
                {downloadPreview.sourceUrl || downloadPreview.blobUrl ? (
                  <a
                    href={downloadPreview.sourceUrl || downloadPreview.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={downloadPreview.blobUrl ? downloadPreview.fileName : undefined}
                    className="rounded-md border border-black/15 px-2.5 py-1 text-xs text-black dark:border-white/20 dark:text-white"
                  >
                    Download
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (downloadPreview.blobUrl) URL.revokeObjectURL(downloadPreview.blobUrl);
                    setDownloadPreview(null);
                  }}
                  className="rounded-md border border-black/15 px-2.5 py-1 text-xs text-black dark:border-white/20 dark:text-white"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="grid h-[72vh] gap-3 bg-black/[0.03] p-3 md:grid-cols-[minmax(0,1fr)_280px] dark:bg-black/30">
              <div className="min-h-0">
                {resolvePreviewFrameUrl(downloadPreview) ? (
                  <iframe
                    src={resolvePreviewFrameUrl(downloadPreview)}
                    title={downloadPreview.fileName}
                    className="h-full w-full rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black/35"
                  />
                ) : (
                  renderGeneratedPreview(downloadPreview)
                )}
              </div>
              <div className="min-h-0">
                {renderPreviewDataRoom(downloadPreview)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ChatPage;
