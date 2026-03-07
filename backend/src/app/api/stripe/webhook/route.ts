import { PlanTier, resolvePlanByPriceId } from '@/lib/plans';
import { verifyStripeWebhookSignature } from '@/lib/stripe';
import { upsertUserPlan } from '@/lib/usage';

export const runtime = 'nodejs';

const parsePlanTier = (value: string | undefined): PlanTier => {
  if (value === 'starter') return 'starter';
  if (value === 'pro') return 'pro';
  if (value === 'business') return 'business';
  if (value === 'enterprise') return 'enterprise';
  return 'free';
};

export const POST = async (req: Request) => {
  try {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !secret) {
      return Response.json({ message: 'Missing stripe webhook signature setup' }, { status: 400 });
    }

    const verified = verifyStripeWebhookSignature({
      payload,
      signatureHeader: signature,
      secret,
    });

    if (!verified.ok) {
      return Response.json({ message: 'Invalid webhook signature', reason: verified.reason }, { status: 400 });
    }

    const event = JSON.parse(payload) as {
      type?: string;
      data?: { object?: Record<string, any> };
    };

    const object = event.data?.object || {};
    const eventType = event?.type || 'unknown';

    if (eventType === 'checkout.session.completed') {
      const subscriptionId = object.subscription as string | undefined;
      const customerId = object.customer as string | undefined;
      const userId = object.metadata?.user_id as string | undefined;
      const planTier = parsePlanTier(object.metadata?.plan_tier as string | undefined);

      if (userId) {
        await upsertUserPlan({
          userId,
          tier: planTier,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: 'active',
        });
      }
    }

    if (
      eventType === 'customer.subscription.created' ||
      eventType === 'customer.subscription.updated' ||
      eventType === 'customer.subscription.deleted'
    ) {
      const customerId = object.customer as string | undefined;
      const subscriptionId = object.id as string | undefined;
      const priceId = object.items?.data?.[0]?.price?.id as string | undefined;
      const userId = (object.metadata?.user_id || object.metadata?.userId) as
        | string
        | undefined;

      if (customerId && subscriptionId && userId) {
        const tier = resolvePlanByPriceId(priceId || '');
        await upsertUserPlan({
          userId,
          tier: eventType === 'customer.subscription.deleted' ? 'free' : tier,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          status: object.status || (eventType === 'customer.subscription.deleted' ? 'canceled' : 'active'),
          currentPeriodEnd: object.current_period_end
            ? new Date(Number(object.current_period_end) * 1000).toISOString()
            : null,
        });
      }
    }

    return Response.json({ received: true, type: eventType }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Stripe webhook processing failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};
