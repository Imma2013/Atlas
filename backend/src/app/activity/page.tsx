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

const ActivityPage = () => {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const storedUserId =
          typeof window !== 'undefined' ? localStorage.getItem('atlasUserId') : null;
        const url = storedUserId ? `/api/activity?userId=${storedUserId}` : '/api/activity';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch activity');
        const data = await res.json();
        setItems(data.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Activity</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
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
              className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-black dark:text-white">{item.title}</p>
                <span className="text-xs text-black/60 dark:text-white/60">{item.type}</span>
              </div>
              <p className="mt-2 text-sm text-black/70 dark:text-white/70 line-clamp-4">
                {item.summary}
              </p>
              {item.links && Object.keys(item.links).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(item.links)
                    .filter(([, href]) => !!href)
                    .map(([key, href]) => (
                      <a
                        key={`${item.id}-${key}`}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-500 hover:underline"
                      >
                        View in {key}
                      </a>
                    ))}
                </div>
              )}
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

