import { z } from 'zod';
import { createCheckoutSession } from '@/lib/stripe';
import { resolvePriceIdByTier, type PlanTier } from '@/lib/plans';
import { hasSupabaseAdmin, supabaseAdminRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

const bodySchema = z.object({
  tier: z.enum(['starter', 'pro', 'business', 'enterprise']),
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

const getBaseUrl = (req: Request) => {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (envBase) return envBase.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

const loadExistingStripeCustomerId = async (userId?: string) => {
  if (!userId || !hasSupabaseAdmin()) return null;
  try {
    const rows = await supabaseAdminRequest<Array<{ stripe_customer_id: string | null }>>({
      path: 'user_plans',
      query: {
        user_id: `eq.${userId}`,
        select: 'stripe_customer_id',
        limit: '1',
      },
    });
    return rows[0]?.stripe_customer_id || null;
  } catch {
    return null;
  }
};

export const POST = async (req: Request) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json(
        { message: 'Missing STRIPE_SECRET_KEY in server environment.' },
        { status: 500 },
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const { tier, userId, email } = parsed.data;
    const priceId = resolvePriceIdByTier(tier as Exclude<PlanTier, 'free'>);
    if (!priceId) {
      return Response.json(
        { message: `Missing Stripe price id for ${tier}.` },
        { status: 500 },
      );
    }

    const baseUrl = getBaseUrl(req);
    const existingCustomerId = await loadExistingStripeCustomerId(userId);

    const session = await createCheckoutSession({
      priceId,
      successUrl: `${baseUrl}/billing?status=success&tier=${tier}`,
      cancelUrl: `${baseUrl}/billing?status=cancelled`,
      customerId: existingCustomerId || undefined,
      customerEmail: existingCustomerId ? undefined : email,
      metadata: {
        ...(userId ? { user_id: userId } : {}),
        tier,
      },
      subscriptionMetadata: {
        ...(userId ? { user_id: userId } : {}),
        tier,
      },
    });

    return Response.json({ url: session.url }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to create Stripe checkout session', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};

