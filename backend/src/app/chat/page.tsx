'use client';

import { useMemo, useState } from 'react';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from '@/lib/modelCatalog';
import { getMicrosoftAccessToken } from '@/lib/microsoftAuthClient';
import { Globe, SendHorizonal, Sparkles } from 'lucide-react';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  downloads?: Array<{
    kind: 'word' | 'excel' | 'powerpoint';
    fileName: string;
    mimeType: string;
    contentBase64?: string;
    webUrl?: string;
    origin: 'microsoft' | 'local';
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
        : 'Ask using Microsoft workspace only (example: draft a reply from Brad email and export to Word).',
    [includeWeb],
  );

  const submit = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userId = getOrCreateUserId();
    const chatId = getOrCreateChatId();
    const microsoftAccessToken = await getMicrosoftAccessToken();
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

      setMessages((prev) => [...prev, { role: 'assistant', text: output, downloads }]);
    } catch (e: any) {
      const message = e?.message || 'Chat request failed';
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <div className="rounded-3xl border border-light-200 bg-white/95 p-6 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black">Atlas Chat</h1>
            <p className="mt-1 text-sm text-black/60">
              Workspace-first assistant with direct Word, Excel, PowerPoint, and draft workflows.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
            <Sparkles size={14} />
            Brain mode active
          </div>
        </div>

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
