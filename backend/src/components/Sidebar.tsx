'use client';

import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Activity,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';
import React, { type ReactNode } from 'react';
import Layout from './Layout';

const VerticalIconContainer = ({ children }: { children: ReactNode }) => {
  return <div className="flex flex-col items-center w-full">{children}</div>;
};

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
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[88px] lg:flex-col">
        <div className="m-4 flex grow flex-col items-center justify-between gap-y-5 overflow-y-auto rounded-3xl border border-black/10 bg-white/70 px-2 py-8 shadow-[0_20px_45px_-35px_rgba(0,0,0,0.75)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03]">
          <div className="h-4" />
          <VerticalIconContainer>
            {navLinks.map((link, i) => (
              <Link
                key={i}
                href={link.href}
                className={cn(
                  'relative flex w-full cursor-pointer flex-col items-center justify-center space-y-0.5 rounded-xl py-2',
                  link.active
                    ? 'text-black dark:text-white'
                    : 'text-black/60 dark:text-white/65',
                )}
              >
                <div
                  className={cn(
                    link.active &&
                      'bg-gradient-to-br from-cyan-200 to-cyan-50 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.5)] dark:from-cyan-500/35 dark:to-cyan-400/5',
                    'group rounded-xl border border-transparent transition duration-200 hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.04]',
                  )}
                >
                  <link.icon
                    size={25}
                    className={cn(
                      !link.active && 'group-hover:scale-105',
                      'm-1.5 transition duration-200',
                    )}
                  />
                </div>
                <p
                  className={cn(
                    link.active
                      ? 'text-black/85 dark:text-white/85'
                      : 'text-black/60 dark:text-white/60',
                    'text-[10px] uppercase tracking-[0.12em]',
                  )}
                >
                  {link.label}
                </p>
              </Link>
            ))}
          </VerticalIconContainer>
          <div className="h-2" />
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
