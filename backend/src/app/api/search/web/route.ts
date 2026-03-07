import { searchWeb } from '@/lib/search';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  query: z.string().min(1),
  model: z.string().optional(),
});

export const POST = async (req: Request) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const response = await searchWeb({
      query: parsed.data.query,
      model: parsed.data.model || process.env.OPENROUTER_MID_MODEL || 'anthropic/claude-sonnet-4',
    });

    return Response.json(response, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Web search failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};
