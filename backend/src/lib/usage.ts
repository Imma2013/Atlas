import { PlanTier, PLAN_CONFIGS } from '@/lib/plans';
import {
  hasSupabaseAdmin,
  isSupabaseMissingTableError,
  supabaseAdminRequest,
} from '@/lib/supabase';

export type AIActionType = 'summary' | 'draft' | 'search' | 'deck' | 'analysis';

type UserPlanRow = {
  user_id: string;
  tier: PlanTier;
};

const getMonthStartISOString = () => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return monthStart.toISOString();
};

export const getUserPlanTier = async (userId: string): Promise<PlanTier> => {
  if (!hasSupabaseAdmin()) {
    return 'free';
  }

  let rows: UserPlanRow[] = [];
  try {
    rows = await supabaseAdminRequest<UserPlanRow[]>({
      path: 'user_plans',
      query: {
        user_id: `eq.${userId}`,
        select: 'user_id,tier',
        limit: '1',
      },
    });
  } catch (error) {
    if (isSupabaseMissingTableError(error, 'user_plans')) {
      console.warn('Missing Supabase table public.user_plans. Defaulting plan tier to free.');
      return 'free';
    }
    throw error;
  }

  return rows[0]?.tier || 'free';
};

export const getMonthlyUsageCount = async (userId: string): Promise<number> => {
  if (!hasSupabaseAdmin()) {
    return 0;
  }

  let rows: Array<{ id: string }> = [];
  try {
    rows = await supabaseAdminRequest<Array<{ id: string }>>({
      path: 'ai_usage',
      query: {
        user_id: `eq.${userId}`,
        created_at: `gte.${getMonthStartISOString()}`,
        select: 'id',
        limit: '5000',
      },
    });
  } catch (error) {
    if (isSupabaseMissingTableError(error, 'ai_usage')) {
      console.warn('Missing Supabase table public.ai_usage. Skipping usage cap checks.');
      return 0;
    }
    throw error;
  }

  return rows.length;
};

export const assertUsageWithinPlan = async (userId?: string) => {
  if (!userId || !hasSupabaseAdmin()) {
    return { allowed: true as const, tier: 'free' as PlanTier, used: 0, limit: null as number | null };
  }

  const [tier, used] = await Promise.all([getUserPlanTier(userId), getMonthlyUsageCount(userId)]);
  const limit = PLAN_CONFIGS[tier].monthlyActions;

  if (limit !== null && used >= limit) {
    return { allowed: false as const, tier, used, limit };
  }

  return { allowed: true as const, tier, used, limit };
};

export const getUsageSnapshot = async (userId?: string) => {
  if (!userId || !hasSupabaseAdmin()) {
    return {
      tier: 'free' as PlanTier,
      used: 0,
      limit: PLAN_CONFIGS.free.monthlyActions,
      remaining: PLAN_CONFIGS.free.monthlyActions,
      unlimited: false,
    };
  }

  const [tier, used] = await Promise.all([getUserPlanTier(userId), getMonthlyUsageCount(userId)]);
  const limit = PLAN_CONFIGS[tier].monthlyActions;
  const remaining = limit === null ? null : Math.max(0, limit - used);

  return {
    tier,
    used,
    limit,
    remaining,
    unlimited: limit === null,
  };
};

export const recordAIUsage = async (input: {
  userId?: string;
  actionType: AIActionType;
  modelUsed: string;
  tokensIn?: number;
  tokensOut?: number;
}) => {
  if (!input.userId || !hasSupabaseAdmin()) {
    return;
  }

  try {
    await supabaseAdminRequest({
      path: 'ai_usage',
      method: 'POST',
      body: {
        user_id: input.userId,
        action_type: input.actionType,
        model_used: input.modelUsed,
        tokens_in: input.tokensIn || 0,
        tokens_out: input.tokensOut || 0,
      },
    });
  } catch (error) {
    if (isSupabaseMissingTableError(error, 'ai_usage')) {
      console.warn('Missing Supabase table public.ai_usage. Usage event was not recorded.');
      return;
    }
    throw error;
  }
};

export const upsertUserPlan = async (input: {
  userId: string;
  tier: PlanTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  status?: string;
  currentPeriodEnd?: string | null;
}) => {
  if (!hasSupabaseAdmin()) {
    return;
  }

  await supabaseAdminRequest({
    path: 'user_plans',
    method: 'POST',
    body: {
      user_id: input.userId,
      tier: input.tier,
      stripe_customer_id: input.stripeCustomerId || null,
      stripe_subscription_id: input.stripeSubscriptionId || null,
      stripe_price_id: input.stripePriceId || null,
      status: input.status || 'active',
      current_period_end: input.currentPeriodEnd || null,
    },
    query: {
      on_conflict: 'user_id',
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
};
