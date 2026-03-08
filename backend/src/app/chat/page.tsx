'use client';

import { useMemo, useState } from 'react';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

const MODEL_OPTIONS = [
  { label: 'Claude Haiku 4.5 (Router/Cheap)', value: 'anthropic/claude-haiku-4-5' },
  { label: 'Claude Sonnet 4 (Default)', value: 'anthropic/claude-sonnet-4' },
  { label: 'Claude Opus 4 (Heavy)', value: 'anthropic/claude-opus-4' },
  { label: 'Gemini 2.5 Flash', value: 'gemini/gemini-2.5-flash' },
  { label: 'Gemini 2.5 Pro', value: 'gemini/gemini-2.5-pro' },
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

const ChatPage = () => {
  const [model, setModel] = useState('anthropic/claude-sonnet-4');
  const [includeWeb, setIncludeWeb] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const placeholder = useMemo(
    () =>
      includeWeb
        ? 'Ask about your workspace, and optionally web context...'
        : 'Ask about Outlook, Teams, OneDrive, Word, Excel, PowerPoint...',
    [includeWeb],
  );

  const submit = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userId = getOrCreateUserId();
    const microsoftAccessToken =
      typeof window !== 'undefined'
        ? localStorage.getItem('atlasMicrosoftAccessToken') || ''
        : '';

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
            chatId: `chat-${Date.now()}`,
            content: query,
          },
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
          : JSON.stringify(data?.output ?? data, null, 2);

      setMessages((prev) => [...prev, { role: 'assistant', text: output }]);
    } catch (e: any) {
      const message = e?.message || 'Chat request failed';
      setError(message);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Chat</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Workspace-first AI with optional web search.
      </p>

      <div className="mt-5 rounded-xl border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm text-black/70 dark:text-white/70">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-transparent px-3 py-2 text-sm"
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={includeWeb}
              onChange={(e) => setIncludeWeb(e.target.checked)}
            />
            <span className="text-sm text-black/80 dark:text-white/80">Enable Web Search</span>
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
            className="flex-1 rounded-lg border border-light-200 dark:border-dark-200 bg-transparent px-3 py-2 text-sm"
          />
          <button
            onClick={submit}
            disabled={loading}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Running...' : 'Send'}
          </button>
        </div>

        {error ? (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-xl border p-3 ${
              message.role === 'user'
                ? 'border-sky-500/40 bg-sky-500/10'
                : 'border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary'
            }`}
          >
            <p className="mb-1 text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
              {message.role}
            </p>
            <pre className="whitespace-pre-wrap break-words text-sm text-black dark:text-white">
              {message.text}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatPage;
