import { createPortalSession } from '@/lib/stripe';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  customerId: z.string().min(1),
  returnUrl: z.string().url().optional(),
});

export const POST = async (req: Request) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const portal = await createPortalSession({
      customerId: parsed.data.customerId,
      returnUrl: parsed.data.returnUrl || `${process.env.APP_URL || 'http://localhost:3000'}/settings/billing`,
    });

    return Response.json({ id: portal.id, url: portal.url }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Portal session creation failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};