'use client';

import { useMemo, useState } from 'react';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from '@/lib/modelCatalog';
import { getMicrosoftAccessToken } from '@/lib/microsoftAuthClient';
import { getGoogleAccessToken } from '@/lib/googleAuthClient';
import { Check, Globe, SendHorizonal, Sparkles, X } from 'lucide-react';

type MCPServer =
  | 'Word'
  | 'Excel'
  | 'PowerPoint'
  | 'Outlook'
  | 'OneDrive'
  | 'Teams'
  | 'Calendar'
  | 'SharePoint';

type PendingDraft = {
  provider: 'outlook' | 'gmail';
  to: string[];
  subject: string;
  body: string;
  contentType: 'Text' | 'HTML';
};

type LoadedMcpServer = {
  serverId: string;
  displayName: string;
  source: 'official' | 'custom';
  mode: 'read_only' | 'read_draft';
  tools: string[];
  blockedTools: string[];
};

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  route?: {
    required_mcp_servers: MCPServer[];
    reasoning: string;
  };
  pendingDraft?: PendingDraft;
  draftState?: 'idle' | 'creating' | 'created' | 'failed' | 'cancelled';
  draftError?: string;
  draftWebLink?: string;
  loadedMcpServers?: LoadedMcpServer[];
  downloads?: Array<{
    kind: 'word' | 'excel' | 'powerpoint';
    fileName: string;
    mimeType: string;
    contentBase64?: string;
    webUrl?: string;
    origin: 'microsoft' | 'google' | 'local';
  }>;
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
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const starterCards = [
  {
    title: 'Spreadsheets',
    description: 'Track metrics, budget, and forecast summaries.',
    icon: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/excel_48x1.svg',
    prompt: 'Make an Excel sheet summary from my latest workspace context.',
  },
  {
    title: 'Documents',
    description: 'Create polished Word-ready drafts and briefs.',
    icon: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/word_48x1.svg',
    prompt: 'Make a Word document draft from this request.',
  },
  {
    title: 'Presentations',
    description: 'Build slide outlines for quick deck creation.',
    icon: 'https://static2.sharepointonline.com/files/fabric/assets/brand-icons/product-fluent/svg/powerpoint_48x1.svg',
    prompt: 'Create a PowerPoint outline for this topic.',
  },
];

const ChatPage = () => {
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [includeWeb, setIncludeWeb] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const groupedModels = useMemo(() => {
    const groups = {
      Anthropic: CHAT_MODEL_OPTIONS.filter((m) => m.provider === 'anthropic'),
      Gemini: CHAT_MODEL_OPTIONS.filter((m) => m.provider === 'gemini'),
    };
    return groups;
  }, []);

  const placeholder = useMemo(
    () =>
      includeWeb
        ? 'Ask with workspace + web context (example: summarize this Teams meeting and compare with latest market updates).'
        : 'Ask using connected Microsoft + Google workspace (example: summarize Gmail invoice and export to Excel).',
    [includeWeb],
  );

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
          ...(microsoftAccessToken
            ? { 'x-microsoft-access-token': microsoftAccessToken }
            : {}),
          ...(googleAccessToken
            ? { 'x-google-access-token': googleAccessToken }
            : {}),
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
          openRouterModels: {
            midModel: model,
          },
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
      const route =
        data?.route &&
        Array.isArray(data.route.required_mcp_servers) &&
        typeof data.route.reasoning === 'string'
          ? {
              required_mcp_servers: data.route.required_mcp_servers as MCPServer[],
              reasoning: data.route.reasoning as string,
            }
          : undefined;
      const pendingDraft =
        data?.pendingDraft &&
        (data.pendingDraft.provider === 'gmail' || data.pendingDraft.provider === 'outlook') &&
        Array.isArray(data.pendingDraft.to) &&
        typeof data.pendingDraft.subject === 'string' &&
        typeof data.pendingDraft.body === 'string'
          ? (data.pendingDraft as PendingDraft)
          : undefined;
      const loadedMcpServers = Array.isArray(data?.loadedMcpServers)
        ? (data.loadedMcpServers as LoadedMcpServer[])
        : [];

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: output,
          downloads,
          route,
          pendingDraft,
          loadedMcpServers,
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
        itemIndex === index
          ? { ...item, draftState: 'creating', draftError: '' }
          : item,
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
            ? 'Google Gmail is not connected. Connect in Apps first.'
            : 'Microsoft is not connected. Connect in Apps first.',
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
            ? {
                ...item,
                draftState: 'failed',
                draftError: e?.message || 'Draft creation failed',
              }
            : item,
        ),
      );
    }
  };

  const cancelDraft = (index: number) => {
    setMessages((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, draftState: 'cancelled', draftError: '' }
          : item,
      ),
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="rounded-3xl border border-light-200 bg-white/95 p-6 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black">
              {messages.length === 0 ? 'How can I help you?' : 'Atlas Chat'}
            </h1>
            <p className="mt-1 text-sm text-black/60">
              Workspace-first assistant with direct Word, Excel, PowerPoint, and draft workflows.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            <Sparkles size={14} />
            Brain mode active
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {starterCards.map((card) => (
              <button
                key={card.title}
                type="button"
                onClick={() => setInput(card.prompt)}
                className="rounded-2xl border border-light-200 bg-white p-4 text-left transition hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <img src={card.icon} alt={`${card.title} icon`} className="h-6 w-6" />
                  <p className="text-base font-semibold text-black">{card.title}</p>
                </div>
                <p className="mt-2 text-sm text-black/65">{card.description}</p>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-black/10 bg-gradient-to-br from-white to-slate-50 p-3">
          <label className="block">
            <span className="mb-1 block px-1 text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Chat model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-light-200 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <optgroup label="Anthropic">
                {groupedModels.Anthropic.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gemini">
                {groupedModels.Gemini.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="mt-3 rounded-2xl border border-black/10 bg-white p-2 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.4)]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder}
              className="w-full rounded-xl border-none bg-transparent px-2 py-2 text-sm outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIncludeWeb((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  includeWeb
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-black/10 bg-white text-black/70 hover:bg-black/5'
                }`}
              >
                <Globe size={13} />
                Web {includeWeb ? 'On' : 'Off'}
              </button>

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
            {message.role === 'assistant' && message.route ? (
              <div className="mt-3 rounded-xl border border-black/10 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
                  Router decision
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(message.route.required_mcp_servers || []).map((server) => (
                    <span
                      key={server}
                      className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-black/80"
                    >
                      {server}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-black/60">{message.route.reasoning}</p>
                {message.loadedMcpServers && message.loadedMcpServers.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {message.loadedMcpServers.map((server) => (
                      <div key={server.serverId} className="rounded-lg border border-black/10 bg-white p-2">
                        <p className="text-xs font-semibold text-black">
                          {server.displayName} ({server.serverId}) - {server.mode} - {server.source}
                        </p>
                        <p className="mt-1 text-[11px] text-black/70">
                          Allowed tools: {server.tools.join(', ') || 'None'}
                        </p>
                        {server.blockedTools.length > 0 ? (
                          <p className="mt-1 text-[11px] text-amber-700">
                            Blocked tools: {server.blockedTools.join(', ')}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {message.role === 'assistant' && message.pendingDraft ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">
                  {message.pendingDraft.provider === 'gmail' ? 'Gmail' : 'Outlook'} Draft Review
                </p>
                <p className="mt-1 text-xs text-black/70">
                  Atlas will only create a draft. It will not send email on your behalf.
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
                    onClick={() => cancelDraft(index)}
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
                      Open Draft in {message.pendingDraft.provider === 'gmail' ? 'Gmail' : 'Outlook'}
                    </a>
                  ) : null}
                </div>
                {message.draftState === 'cancelled' ? (
                  <p className="mt-2 text-xs text-black/60">Draft creation cancelled.</p>
                ) : null}
                {message.draftState === 'failed' && message.draftError ? (
                  <p className="mt-2 text-xs text-red-600">{message.draftError}</p>
                ) : null}
              </div>
            ) : null}
            {message.role === 'assistant' && message.downloads && message.downloads.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.downloads.map((download, downloadIndex) => {
                  const label = `${download.kind.toUpperCase()}${download.origin === 'local' ? ' (Download)' : ' (Microsoft)'}`;
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
