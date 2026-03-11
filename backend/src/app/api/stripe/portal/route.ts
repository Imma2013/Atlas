import { z } from 'zod';
import { createPortalSession } from '@/lib/stripe';
import { hasSupabaseAdmin, supabaseAdminRequest } from '@/lib/supabase';

export const runtime = 'nodejs';

const bodySchema = z.object({
  userId: z.string().uuid(),
});

const getBaseUrl = (req: Request) => {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (envBase) return envBase.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
};

export const POST = async (req: Request) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json(
        { message: 'Missing STRIPE_SECRET_KEY in server environment.' },
        { status: 500 },
      );
    }

    if (!hasSupabaseAdmin()) {
      return Response.json(
        { message: 'Supabase admin is not configured.' },
        { status: 500 },
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const rows = await supabaseAdminRequest<Array<{ stripe_customer_id: string | null }>>({
      path: 'user_plans',
      query: {
        user_id: `eq.${parsed.data.userId}`,
        select: 'stripe_customer_id',
        limit: '1',
      },
    });

    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      return Response.json(
        { message: 'No Stripe customer found for this user.' },
        { status: 404 },
      );
    }

    const session = await createPortalSession({
      customerId,
      returnUrl: `${getBaseUrl(req)}/billing`,
    });

    return Response.json({ url: session.url }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to create Stripe portal session', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};

