import { createActivityItem } from '@/lib/activity';
import { hasSupabaseAdmin, supabaseAdminRequest } from '@/lib/supabase';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(['meeting', 'email', 'file', 'deck', 'spreadsheet', 'web_search']),
  sourceId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  modelUsed: z.string().min(1),
  actionItems: z.array(z.any()).optional(),
  decisions: z.array(z.any()).optional(),
  links: z.record(z.string(), z.string()).optional(),
});

export const GET = async (req: Request) => {
  try {
    if (!hasSupabaseAdmin()) {
      return Response.json({ items: [], message: 'Supabase admin not configured' }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || req.headers.get('x-user-id');

    if (!userId) {
      return Response.json({ message: 'Missing userId' }, { status: 400 });
    }

    const items = await supabaseAdminRequest<Array<Record<string, any>>>({
      path: 'activity_items',
      query: {
        user_id: `eq.${userId}`,
        select: '*',
        order: 'updated_at.desc',
        limit: '100',
      },
    });

    return Response.json({ items }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to fetch activity items', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};

export const POST = async (req: Request) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    await createActivityItem(parsed.data);
    return Response.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to create activity item', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};
