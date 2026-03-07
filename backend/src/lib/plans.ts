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
    monthlyActions: 50,
    allowAutoJoinBot: false,
    allowBigModel: false,
  },
  starter: {
    tier: 'starter',
    monthlyPriceUsd: 19,
    monthlyActions: 300,
    allowAutoJoinBot: true,
    allowBigModel: false,
  },
  pro: {
    tier: 'pro',
    monthlyPriceUsd: 49,
    monthlyActions: 1000,
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
