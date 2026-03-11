'use client';

import { useEffect, useState } from 'react';

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

  return (
    <div className="px-2 pb-20 pt-10">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Activity</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        AI summaries, searches, and generated outputs.
      </p>

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-black/60 dark:text-white/60">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No activity yet.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-light-200 bg-light-primary p-4 dark:border-dark-200 dark:bg-dark-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-black dark:text-white">{item.title}</p>
                <span className="text-xs text-black/60 dark:text-white/60">{item.type}</span>
              </div>

              <p className="mt-2 line-clamp-4 text-sm text-black/70 dark:text-white/70">
                {item.summary}
              </p>

              {item.summary ? (
                <div className="mt-2 rounded-lg bg-light-100 px-2 py-2 text-xs text-black/70 dark:bg-dark-200 dark:text-white/70">
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
                        className="text-xs text-sky-700 underline underline-offset-2 hover:text-sky-800"
                      >
                        View in {key}
                      </a>
                    ))}
                </div>
              ) : null}

              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                {item.model_used} • {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityPage;

