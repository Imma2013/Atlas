import { refreshMicrosoftToken } from '@/lib/microsoft';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const POST = async (req: Request) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const tokens = await refreshMicrosoftToken(parsed.data.refreshToken);
    return Response.json({ tokens }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      {
        message: 'Failed to refresh Microsoft token',
        error: error?.message || 'Unknown error',
      },
      { status: 401 },
    );
  }
};
