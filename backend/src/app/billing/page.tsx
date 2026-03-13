'use client';

import { useEffect, useMemo, useState } from 'react';
import { PLAN_CONFIGS, type PlanTier } from '@/lib/plans';
import { ArrowRight, Crown, ShieldCheck, Sparkles } from 'lucide-react';

const paidTiers: Array<Exclude<PlanTier, 'free'>> = ['starter', 'pro', 'business', 'enterprise'];

const BillingPage = () => {
  const [loadingTier, setLoadingTier] = useState<string>('');
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<{
    tier: PlanTier;
    used: number;
    limit: number | null;
    remaining: number | null;
    unlimited: boolean;
  } | null>(null);

  const userId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('atlasUserId') || '';
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/usage?userId=${encodeURIComponent(userId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) return;
        setUsage({
          tier: data.tier,
          used: Number(data.used || 0),
          limit: data.limit === null ? null : Number(data.limit),
          remaining: data.remaining === null ? null : Number(data.remaining),
          unlimited: Boolean(data.unlimited),
        });
      })
      .catch(() => {});
  }, [userId]);

  const startCheckout = async (tier: Exclude<PlanTier, 'free'>) => {
    setLoadingTier(tier);
    setError('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, userId: userId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || 'Failed to create checkout session');
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || 'Failed to open checkout');
      setLoadingTier('');
    }
  };

  const openPortal = async () => {
    setLoadingTier('portal');
    setError('');
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.message || 'Failed to open billing portal');
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || 'Failed to open billing portal');
      setLoadingTier('');
    }
  };

  return (
    <div className="px-2 pb-20 pt-8 md:px-4 md:pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-black/10 bg-[linear-gradient(135deg,#f8fbff_0%,#eff6ff_45%,#fff7ed_100%)] p-6 shadow-[0_30px_80px_-55px_rgba(20,30,60,0.6)] dark:border-white/10 dark:bg-[linear-gradient(135deg,#111827_0%,#0f172a_45%,#1f2937_100%)]">
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/15" />
          <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/10" />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] text-black/70 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                <Sparkles size={12} />
                Billing
              </p>
              <h1 className="mt-3 font-['Iowan_Old_Style',serif] text-4xl leading-[1.02] text-black dark:text-white md:text-5xl">
                Scale Your Automation
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-black/65 dark:text-white/65">
                Choose a plan with monthly action caps and predictable spend. Stripe checkout and usage enforcement are live.
              </p>
            </div>

            {usage ? (
              <div className="min-w-[240px] rounded-2xl border border-black/10 bg-white/85 p-3 backdrop-blur dark:border-white/15 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.12em] text-black/55 dark:text-white/55">Current usage</p>
                <p className="mt-1 text-lg font-semibold capitalize text-black dark:text-white">{usage.tier}</p>
                <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                  Used: <span className="font-semibold">{usage.used}</span>
                  {usage.unlimited ? ' of unlimited' : ` of ${usage.limit}`}
                </p>
                {!usage.unlimited ? (
                  <div className="mt-2">
                    <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                        style={{
                          width: `${Math.max(4, Math.min(100, Math.round(((usage.used || 0) / Math.max(1, usage.limit || 1)) * 100)))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-black/65 dark:text-white/65">Remaining: {usage.remaining}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-[0_16px_38px_-30px_rgba(0,0,0,0.7)] md:p-5 dark:border-emerald-400/40 dark:from-emerald-500/10 dark:to-transparent">
            <p className="text-lg font-semibold capitalize text-black dark:text-white">free</p>
            <p className="mt-1 text-3xl font-semibold text-black dark:text-white">$0/mo</p>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              {PLAN_CONFIGS.free.monthlyActions} actions/month
            </p>
            <p className="mt-1 text-xs text-black/60 dark:text-white/60">Great for trying workspace + web automation.</p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
              <ShieldCheck size={12} />
              Included by default for every account
            </p>
            {usage && usage.tier === 'free' ? (
              <p className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-100/60 px-2.5 py-1.5 text-xs text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100">
                You are on Free: {usage.remaining} credits left this month.
              </p>
            ) : null}
          </div>

          {paidTiers.map((tier) => {
            const plan = PLAN_CONFIGS[tier];
            const featured = tier === 'pro';
            return (
              <div
                key={tier}
                className={`relative overflow-hidden rounded-2xl border p-4 shadow-[0_16px_38px_-30px_rgba(0,0,0,0.7)] transition md:p-5 ${
                  featured
                    ? 'border-cyan-300 bg-gradient-to-br from-cyan-50 to-white dark:border-cyan-400/40 dark:bg-gradient-to-br dark:from-cyan-500/15 dark:to-transparent'
                    : 'border-black/10 bg-white/90 dark:border-white/10 dark:bg-white/[0.03]'
                }`}
              >
                {featured ? (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white dark:bg-white dark:text-black">
                    <Crown size={11} />
                    Popular
                  </span>
                ) : null}
                <p className="text-lg font-semibold capitalize text-black dark:text-white">{tier}</p>
                <p className="mt-1 text-3xl font-semibold text-black dark:text-white">
                  {plan.monthlyPriceUsd === null ? 'Custom' : `$${plan.monthlyPriceUsd}/mo`}
                </p>
                <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                  {plan.monthlyActions === null
                    ? 'Unlimited monthly actions'
                    : `${plan.monthlyActions} actions/month`}
                </p>
                <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                  {plan.allowBigModel ? 'Includes advanced models' : 'Standard model access'}
                </p>
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck size={12} />
                  Usage cap enforced monthly
                </p>

                {plan.monthlyPriceUsd === null ? (
                  <a
                    href="mailto:lloyd.ebnchenge@gmail.com?subject=Cryzo%20Enterprise%20Plan"
                    className="mt-4 inline-flex items-center gap-1 rounded-lg border border-black/15 px-3 py-2 text-sm text-black transition hover:bg-black/[0.03] dark:border-white/20 dark:text-white dark:hover:bg-white/[0.04]"
                  >
                    Contact Sales
                    <ArrowRight size={14} />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => startCheckout(tier)}
                    disabled={loadingTier.length > 0}
                    className="mt-4 inline-flex items-center gap-1 rounded-lg bg-black px-3 py-2 text-sm text-white transition hover:translate-y-[-1px] disabled:opacity-60 dark:bg-white dark:text-black"
                  >
                    {loadingTier === tier ? 'Opening checkout...' : 'Choose Plan'}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={openPortal}
          disabled={loadingTier.length > 0}
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black transition hover:bg-black/[0.03] disabled:opacity-60 dark:border-white/20 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.05]"
        >
          {loadingTier === 'portal' ? 'Opening portal...' : 'Manage Billing'}
          <ArrowRight size={14} />
        </button>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
};

export default BillingPage;
