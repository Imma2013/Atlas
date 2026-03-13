'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Sparkles } from 'lucide-react';

type ActivityItem = {
  id: string;
  source_id?: string;
  chat_id?: string;
  type: string;
  title: string;
  summary: string;
  model_used: string;
  created_at: string;
  links?: Record<string, string>;
  action_items?: unknown[];
  decisions?: unknown[];
  actionItems?: unknown[];
  decisionItems?: unknown[];
};

const LOCAL_ACTIVITY_KEY = 'atlasLocalActivity';
const ACTIVITY_SELECTION_KEY = 'atlasOpenActivityItem';
const readLocalActivity = (): ActivityItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]';
    const parsed = JSON.parse(raw) as ActivityItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toStringList = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object' && 'text' in (item as Record<string, unknown>)) {
            return String((item as Record<string, unknown>).text || '').trim();
          }
          return String(item || '').trim();
        })
        .filter(Boolean)
    : [];

const parseSummarySections = (summary: string) => {
  const lines = String(summary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading =
      line.match(/^#{1,6}\s+(.+)$/)?.[1] ||
      line.match(/^([A-Za-z][A-Za-z0-9 _-]{2,60}):$/)?.[1];

    if (heading) {
      if (current?.lines.length) sections.push(current);
      current = { title: heading.trim(), lines: [] };
      continue;
    }

    if (!current) current = { title: 'Summary', lines: [] };
    current.lines.push(line.replace(/^[-*•]\s+/, '').trim());
  }

  if (current?.lines.length) sections.push(current);
  if (sections.length > 0) return sections;

  return [
    {
      title: 'Summary',
      lines: lines.slice(0, 6),
    },
  ];
};

const ActivityPage = () => {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mergeItems = (localItems: ActivityItem[], remoteItems: ActivityItem[]) =>
      [...localItems, ...remoteItems]
        .reduce((acc, item) => {
          const key = item.chat_id || item.source_id || item.id;
          const existingIndex = acc.findIndex(
            (entry) => (entry.chat_id || entry.source_id || entry.id) === key,
          );
          if (existingIndex >= 0) {
            const existing = acc[existingIndex];
            const existingTs = new Date(existing.created_at).getTime();
            const currentTs = new Date(item.created_at).getTime();
            if (currentTs >= existingTs) {
              acc[existingIndex] = { ...item, title: existing.title || item.title };
            }
          } else {
            acc.push(item);
          }
          return acc;
        }, [] as ActivityItem[])
        .sort((a, b) => {
          const aTs = new Date(a.created_at).getTime();
          const bTs = new Date(b.created_at).getTime();
          return bTs - aTs;
        });

    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const localItems = readLocalActivity();
        const storedUserId =
          typeof window !== 'undefined' ? localStorage.getItem('atlasUserId') : null;

        if (!storedUserId) {
          setItems(localItems);
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`/api/activity?userId=${storedUserId}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json().catch(() => ({}));
        const remoteItems = res.ok
          ? ((data.items || []) as ActivityItem[]).map((item) => ({
              ...item,
              chat_id: item.chat_id || item.source_id,
              actionItems: toStringList(item.actionItems || item.action_items),
              decisionItems: toStringList(item.decisionItems || item.decisions),
            }))
          : [];
        setItems(mergeItems(localItems, remoteItems));
      } catch {
        setItems(readLocalActivity());
      } finally {
        setLoading(false);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== LOCAL_ACTIVITY_KEY) return;
      load(false);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false);
    };

    load(true);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);

    const poll = window.setInterval(() => {
      load(false);
    }, 8000);

    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, []);

  const openInChat = (item: ActivityItem) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ACTIVITY_SELECTION_KEY, JSON.stringify(item));
      localStorage.setItem(ACTIVITY_SELECTION_KEY, JSON.stringify(item));
    }

    router.push(`/chat?fromActivity=1&activityId=${encodeURIComponent(item.id)}`);
  };

  return (
    <div className="px-2 pb-20 pt-10 lg:pt-12">
      <div className="relative overflow-hidden rounded-3xl border border-black/10 bg-[radial-gradient(circle_at_top_left,#f4f6ff_0%,#fbfdff_44%,#ffffff_70%)] p-6 dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,#1e2538_0%,#121726_44%,#0b0f19_70%)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-400/10" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-400/10" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.18em] text-black/55 dark:text-white/55">
            Workspace Timeline
          </p>
          <h1 className="mt-2 font-['PP_Editorial',serif] text-4xl leading-none text-black dark:text-white">
            Activity
          </h1>
          <p className="mt-2 max-w-xl text-sm text-black/65 dark:text-white/65">
            Open any item and continue directly in chat without rebuilding the context.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="text-sm text-black/60 dark:text-white/60">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No activity yet.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openInChat(item)}
              className="group block w-full rounded-2xl border border-black/10 bg-white/85 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_14px_28px_-20px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:shadow-[0_14px_28px_-20px_rgba(0,0,0,0.8)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-black dark:text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-black/55 dark:text-white/55">
                    {item.type}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.03] px-2 py-1 text-[11px] text-black/65 transition group-hover:bg-black group-hover:text-white dark:border-white/15 dark:bg-white/[0.04] dark:text-white/70 dark:group-hover:bg-white dark:group-hover:text-black">
                  Open
                  <ArrowUpRight size={12} />
                </span>
              </div>

              <p className="mt-3 line-clamp-4 text-sm leading-6 text-black/75 dark:text-white/75">
                {item.summary}
              </p>

              {item.summary ? (
                <div className="mt-2 space-y-2">
                  {parseSummarySections(item.summary)
                    .slice(0, 3)
                    .map((section, idx) => (
                      <div
                        key={`${item.id}-section-${idx}`}
                        className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-black/70 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70"
                      >
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/55">
                          {section.title}
                        </p>
                        {section.lines.slice(0, 4).map((line, lineIdx) => (
                          <p key={`${item.id}-section-${idx}-line-${lineIdx}`}>{line}</p>
                        ))}
                      </div>
                    ))}
                </div>
              ) : null}

              {(item.actionItems && item.actionItems.length > 0) || (item.decisionItems && item.decisionItems.length > 0) ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {item.actionItems && item.actionItems.length > 0 ? (
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/55">
                        Action Items
                      </p>
                      {item.actionItems.slice(0, 4).map((entry, idx) => (
                        <p key={`${item.id}-action-${idx}`}>{String(entry)}</p>
                      ))}
                    </div>
                  ) : null}
                  {item.decisionItems && item.decisionItems.length > 0 ? (
                    <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/55 dark:text-white/55">
                        Decisions
                      </p>
                      {item.decisionItems.slice(0, 4).map((entry, idx) => (
                        <p key={`${item.id}-decision-${idx}`}>{String(entry)}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {item.links && Object.keys(item.links).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(item.links)
                    .filter(([, href]) => !!href)
                    .map(([key, href]) => (
                      <a
                        key={`${item.id}-${key}`}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs text-sky-700 underline underline-offset-2 hover:text-sky-800"
                      >
                        View in {key}
                      </a>
                    ))}
                </div>
              ) : null}

              <p className="mt-3 inline-flex items-center gap-1 text-xs text-black/55 dark:text-white/55">
                <Sparkles size={12} />
                {item.model_used} • {new Date(item.created_at).toLocaleString()}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityPage;

