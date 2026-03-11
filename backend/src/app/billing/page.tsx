'use client';

import { useMemo, useState } from 'react';
import { PLAN_CONFIGS, type PlanTier } from '@/lib/plans';

const paidTiers: Array<Exclude<PlanTier, 'free'>> = ['starter', 'pro', 'business', 'enterprise'];

const BillingPage = () => {
  const [loadingTier, setLoadingTier] = useState<string>('');
  const [error, setError] = useState('');

  const userId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('atlasUserId') || '';
  }, []);

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
    <div className="px-2 pb-20 pt-10">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Billing</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Choose a Cryzo Agent plan. Usage limits are enforced monthly.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {paidTiers.map((tier) => {
          const plan = PLAN_CONFIGS[tier];
          return (
            <div
              key={tier}
              className="rounded-xl border border-light-200 bg-light-primary p-4 dark:border-dark-200 dark:bg-dark-primary"
            >
              <p className="text-lg font-medium capitalize text-black dark:text-white">{tier}</p>
              <p className="mt-1 text-2xl text-black dark:text-white">
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

              {plan.monthlyPriceUsd === null ? (
                <a
                  href="mailto:billing@cryzo.ai?subject=Cryzo%20Enterprise%20Plan"
                  className="mt-3 inline-block rounded-lg border border-black/15 px-3 py-2 text-sm text-black dark:border-white/20 dark:text-white"
                >
                  Contact Sales
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => startCheckout(tier)}
                  disabled={loadingTier.length > 0}
                  className="mt-3 rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-white dark:text-black"
                >
                  {loadingTier === tier ? 'Opening checkout...' : 'Choose Plan'}
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
        className="mt-4 rounded-lg border border-black/15 px-3 py-2 text-sm text-black disabled:opacity-60 dark:border-white/20 dark:text-white"
      >
        {loadingTier === 'portal' ? 'Opening portal...' : 'Manage Billing'}
      </button>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
};

export default BillingPage;
