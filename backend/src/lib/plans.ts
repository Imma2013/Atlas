export type PlanTier = 'free' | 'starter' | 'pro' | 'business' | 'enterprise';

export type PlanConfig = {
  tier: PlanTier;
  monthlyPriceUsd: number | null;
  monthlyActions: number | null;
  allowAutoJoinBot: boolean;
  allowBigModel: boolean;
};

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    tier: 'free',
    monthlyPriceUsd: 0,
    monthlyActions: 100,
    allowAutoJoinBot: false,
    allowBigModel: false,
  },
  starter: {
    tier: 'starter',
    monthlyPriceUsd: 19,
    monthlyActions: 500,
    allowAutoJoinBot: true,
    allowBigModel: false,
  },
  pro: {
    tier: 'pro',
    monthlyPriceUsd: 49,
    monthlyActions: 2000,
    allowAutoJoinBot: true,
    allowBigModel: true,
  },
  business: {
    tier: 'business',
    monthlyPriceUsd: 129,
    monthlyActions: null,
    allowAutoJoinBot: true,
    allowBigModel: true,
  },
  enterprise: {
    tier: 'enterprise',
    monthlyPriceUsd: null,
    monthlyActions: null,
    allowAutoJoinBot: true,
    allowBigModel: true,
  },
};

export const resolvePlanByPriceId = (priceId: string): PlanTier => {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return 'free';
};

export const resolvePriceIdByTier = (tier: Exclude<PlanTier, 'free'>): string | null => {
  if (tier === 'starter') return process.env.STRIPE_PRICE_STARTER || null;
  if (tier === 'pro') return process.env.STRIPE_PRICE_PRO || null;
  if (tier === 'business') return process.env.STRIPE_PRICE_BUSINESS || null;
  if (tier === 'enterprise') return process.env.STRIPE_PRICE_ENTERPRISE || null;
  return null;
};
