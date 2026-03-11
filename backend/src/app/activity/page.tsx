'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Sparkles } from 'lucide-react';

type ActivityItem = {
  id: string;
  type: string;
  title: string;
  summary: string;
  model_used: string;
  created_at: string;
  links?: Record<string, string>;
};

const LOCAL_ACTIVITY_KEY = 'atlasLocalActivity';

const ActivityPage = () => {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const localItems =
          typeof window !== 'undefined'
            ? (JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]') as ActivityItem[])
            : [];

        const storedUserId =
          typeof window !== 'undefined' ? localStorage.getItem('atlasUserId') : null;

        if (!storedUserId) {
          setItems(localItems);
          return;
        }

        const res = await fetch(`/api/activity?userId=${storedUserId}`);
        const data = await res.json().catch(() => ({}));
        const remoteItems = res.ok ? (data.items || []) : [];
        const merged = [...localItems, ...remoteItems].sort((a, b) => {
          const aTs = new Date(a.created_at).getTime();
          const bTs = new Date(b.created_at).getTime();
          return bTs - aTs;
        });
        setItems(merged);
      } catch {
        const localItems =
          typeof window !== 'undefined'
            ? (JSON.parse(localStorage.getItem(LOCAL_ACTIVITY_KEY) || '[]') as ActivityItem[])
            : [];
        setItems(localItems);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const openInChat = (item: ActivityItem) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('atlasOpenActivityItem', JSON.stringify(item));
    }

    router.push('/chat?fromActivity=1');
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
                <div className="mt-2 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-black/70 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70">
                  {item.summary
                    .split('\n')
                    .filter((line) => line.trim().length > 0)
                    .slice(0, 4)
                    .map((line, idx) => (
                      <p key={`${item.id}-step-${idx}`}>{line}</p>
                    ))}
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

