import { createCheckoutSession } from '@/lib/stripe';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  priceId: z.string().min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  customerEmail: z.string().email().optional(),
  userId: z.string().uuid().optional(),
  planTier: z.enum(['free', 'starter', 'pro', 'business', 'enterprise']).optional(),
});

export const POST = async (req: Request) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const session = await createCheckoutSession({
      priceId: parsed.data.priceId,
      successUrl:
        parsed.data.successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/billing/success`,
      cancelUrl:
        parsed.data.cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/billing/cancel`,
      customerEmail: parsed.data.customerEmail,
      metadata: {
        ...(parsed.data.userId ? { user_id: parsed.data.userId } : {}),
        ...(parsed.data.planTier ? { plan_tier: parsed.data.planTier } : {}),
      },
    });

    return Response.json({ id: session.id, url: session.url }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Checkout session creation failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};
