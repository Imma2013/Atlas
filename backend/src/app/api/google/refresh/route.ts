import { refreshGoogleToken } from '@/lib/google';
import { isGoogleAppKey } from '@/lib/googleScopes';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  refreshToken: z.string().min(1),
  app: z.string().optional(),
});

export const POST = async (req: Request) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const app = isGoogleAppKey(parsed.data.app) ? parsed.data.app : undefined;
    const tokens = await refreshGoogleToken({
      refreshToken: parsed.data.refreshToken,
      app,
    });
    return Response.json({ tokens }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      {
        message: 'Failed to refresh Google token',
        error: error?.message || 'Unknown error',
      },
      { status: 401 },
    );
  }
};

