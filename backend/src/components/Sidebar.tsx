'use client';

import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Activity,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';
import React from 'react';
import Layout from './Layout';

const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const segments = useSelectedLayoutSegments();

  const navLinks = [
    {
      icon: MessageSquare,
      href: '/chat',
      active:
        segments.length === 0 ||
        segments.includes('chat') ||
        segments.includes('c'),
      label: 'Chat',
    },
    {
      icon: Activity,
      href: '/activity',
      active: segments.includes('activity'),
      label: 'Activity',
    },
    {
      icon: Settings,
      href: '/settings',
      active: segments.includes('settings'),
      label: 'Settings',
    },
  ];

  return (
    <div>
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[272px] lg:flex-col">
        <div className="m-4 flex grow flex-col overflow-y-auto rounded-3xl border border-black/10 bg-white/78 p-4 shadow-[0_24px_55px_-40px_rgba(0,0,0,0.78)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b1220]/80">
          <div className="mb-4 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-black/55 dark:text-white/55">
              Workspace
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-black dark:text-white">Atlas Agent</p>
          </div>

          <div className="space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200',
                  link.active
                    ? 'border-cyan-300/60 bg-cyan-50/80 text-black shadow-[0_12px_25px_-20px_rgba(0,0,0,0.45)] dark:border-cyan-400/45 dark:bg-cyan-500/10 dark:text-white'
                    : 'border-transparent text-black/70 hover:border-black/10 hover:bg-black/[0.03] dark:text-white/70 dark:hover:border-white/15 dark:hover:bg-white/[0.04]',
                )}
              >
                <div className="rounded-lg border border-black/10 bg-white/80 p-1.5 dark:border-white/15 dark:bg-white/[0.03]">
                  <link.icon size={18} className={cn(!link.active && 'group-hover:scale-105', 'transition')} />
                </div>
                <p
                  className={cn(
                    link.active
                      ? 'text-black/90 dark:text-white/90'
                      : 'text-black/70 dark:text-white/70',
                    'text-sm font-medium tracking-tight',
                  )}
                >
                  {link.label}
                </p>
              </Link>
            ))}
          </div>
          <div className="mt-auto rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-xs text-black/55 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/55">
            Your workspace history stays in chat until refresh.
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 z-50 flex w-full flex-row items-center gap-x-6 border-t border-black/10 bg-white/85 px-4 py-4 backdrop-blur-md dark:border-white/10 dark:bg-black/60 lg:hidden">
        {navLinks.map((link, i) => (
          <Link
            href={link.href}
            key={i}
            className={cn(
              'relative flex flex-col items-center space-y-1 text-center w-full',
              link.active
                ? 'text-black dark:text-white'
                : 'text-black/70 dark:text-white/70',
            )}
          >
            {link.active && (
              <div className="absolute top-0 -mt-4 h-1 w-full rounded-b-lg bg-cyan-500 dark:bg-cyan-300" />
            )}
            <link.icon />
            <p className="text-xs">{link.label}</p>
          </Link>
        ))}
      </div>

      <Layout>{children}</Layout>
    </div>
  );
};

export default Sidebar;
