import { resolvePlanByPriceId, type PlanTier } from '@/lib/plans';
import { verifyStripeWebhookSignature } from '@/lib/stripe';
import { upsertUserPlan } from '@/lib/usage';
import { hasSupabaseAdmin, supabaseAdminRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

type StripeEvent = {
  type: string;
  data?: { object?: any };
};

const resolveTier = (input: { priceId?: string; metadataTier?: string }): PlanTier => {
  if (input.priceId) {
    const byPrice = resolvePlanByPriceId(input.priceId);
    if (byPrice !== 'free') return byPrice;
  }
  if (input.metadataTier === 'starter') return 'starter';
  if (input.metadataTier === 'pro') return 'pro';
  if (input.metadataTier === 'business') return 'business';
  if (input.metadataTier === 'enterprise') return 'enterprise';
  return 'free';
};

const findUserIdByStripeCustomer = async (customerId: string) => {
  if (!hasSupabaseAdmin()) return null;
  try {
    const rows = await supabaseAdminRequest<Array<{ user_id: string }>>({
      path: 'user_plans',
      query: {
        stripe_customer_id: `eq.${customerId}`,
        select: 'user_id',
        limit: '1',
      },
    });
    return rows[0]?.user_id || null;
  } catch {
    return null;
  }
};

export const POST = async (req: Request) => {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return Response.json(
        { message: 'Missing STRIPE_WEBHOOK_SECRET in server environment.' },
        { status: 500 },
      );
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return Response.json({ message: 'Missing stripe-signature header' }, { status: 400 });
    }

    const payload = await req.text();
    const verified = verifyStripeWebhookSignature({
      payload,
      signatureHeader: signature,
      secret,
    });
    if (!verified.ok) {
      return Response.json({ message: verified.reason }, { status: 400 });
    }

    const event = JSON.parse(payload) as StripeEvent;
    const object = event.data?.object || {};

    if (event.type === 'checkout.session.completed') {
      const userId = object?.metadata?.user_id;
      const tier = resolveTier({ metadataTier: object?.metadata?.tier });
      if (userId) {
        await upsertUserPlan({
          userId,
          tier,
          stripeCustomerId: object.customer || undefined,
          stripeSubscriptionId: object.subscription || undefined,
          status: 'active',
        });
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const customerId = object.customer as string | undefined;
      const userId =
        (object?.metadata?.user_id as string | undefined) ||
        (customerId ? await findUserIdByStripeCustomer(customerId) : null);
      if (userId) {
        const firstItem = object?.items?.data?.[0];
        const priceId = firstItem?.price?.id as string | undefined;
        const tier = resolveTier({
          priceId,
          metadataTier: object?.metadata?.tier as string | undefined,
        });
        await upsertUserPlan({
          userId,
          tier,
          stripeCustomerId: customerId,
          stripeSubscriptionId: object.id || undefined,
          stripePriceId: priceId || undefined,
          status: object.status || 'active',
          currentPeriodEnd: object.current_period_end
            ? new Date(object.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const customerId = object.customer as string | undefined;
      const userId =
        (object?.metadata?.user_id as string | undefined) ||
        (customerId ? await findUserIdByStripeCustomer(customerId) : null);
      if (userId) {
        await upsertUserPlan({
          userId,
          tier: 'free',
          stripeCustomerId: customerId,
          stripeSubscriptionId: object.id || undefined,
          status: 'canceled',
          currentPeriodEnd: object.current_period_end
            ? new Date(object.current_period_end * 1000).toISOString()
            : null,
        });
      }
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to process Stripe webhook', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};

