import {
  hasSupabaseAdmin,
  isSupabaseMissingTableError,
  supabaseAdminRequest,
} from '@/lib/supabase';
import { z } from 'zod';

export const runtime = 'nodejs';

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  kind: z.enum(['word', 'excel', 'powerpoint']),
  name: z.string().min(1),
  mimeType: z.string().min(1).default('text/plain'),
  templateContent: z.string().min(1),
  placeholders: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

export const GET = async (req: Request) => {
  try {
    if (!hasSupabaseAdmin()) {
      return Response.json({ templates: [] }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind');
    const userId = searchParams.get('userId');

    const templates = await supabaseAdminRequest<Array<Record<string, any>>>({
      path: 'artifact_templates',
      query: {
        select:
          'id,user_id,kind,name,mime_type,template_content,placeholders,is_active,created_at,updated_at',
        ...(kind ? { kind: `eq.${kind}` } : {}),
        ...(userId ? { user_id: `eq.${userId}` } : {}),
        order: 'updated_at.desc',
        limit: '100',
      },
    });

    return Response.json({ templates }, { status: 200 });
  } catch (error: any) {
    if (isSupabaseMissingTableError(error, 'artifact_templates')) {
      return Response.json({ templates: [], warning: 'artifact_templates table is missing' }, { status: 200 });
    }
    return Response.json(
      {
        message: 'Failed to fetch templates',
        error: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
};

export const POST = async (req: Request) => {
  try {
    if (!hasSupabaseAdmin()) {
      return Response.json(
        { message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 },
      );
    }

    const parsed = templateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const row = {
      id: parsed.data.id,
      user_id: parsed.data.userId || null,
      kind: parsed.data.kind,
      name: parsed.data.name,
      mime_type: parsed.data.mimeType,
      template_content: parsed.data.templateContent,
      placeholders: parsed.data.placeholders,
      is_active: parsed.data.isActive,
    };

    const result = await supabaseAdminRequest<Array<Record<string, any>>>({
      path: 'artifact_templates',
      method: 'POST',
      body: row,
      query: {
        on_conflict: 'id',
      },
      prefer: 'resolution=merge-duplicates,return=representation',
    });

    return Response.json({ template: result?.[0] || null }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      {
        message: 'Failed to save template',
        error: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
};
