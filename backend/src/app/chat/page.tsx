'use client';

import { useMemo, useState } from 'react';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from '@/lib/modelCatalog';
import { getMicrosoftAccessToken } from '@/lib/microsoftAuthClient';
import { Sparkles } from 'lucide-react';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
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

      setMessages((prev) => [...prev, { role: 'assistant', text: output }]);
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
      <div className="rounded-2xl border border-light-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-black">Atlas Chat</h1>
            <p className="mt-1 text-sm text-black/60">
              Workspace-first assistant with direct Word, Excel, PowerPoint, and draft workflows.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-700">
            <Sparkles size={14} />
            Brain mode active
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm text-black/70">Chat model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-light-200 bg-white px-3 py-2 text-sm"
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

          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={includeWeb}
              onChange={(e) => setIncludeWeb(e.target.checked)}
            />
            <span className="text-sm text-black/80">Enable web source</span>
          </label>
        </div>

        <div className="mt-4 flex gap-2">
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
            className="flex-1 rounded-xl border border-light-200 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Running...' : 'Send'}
          </button>
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatPage;
