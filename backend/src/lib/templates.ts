import {
  hasSupabaseAdmin,
  isSupabaseMissingTableError,
  supabaseAdminRequest,
} from '@/lib/supabase';

export type ArtifactTemplateKind = 'word' | 'excel' | 'powerpoint';

export type ArtifactTemplate = {
  id: string;
  user_id: string | null;
  kind: ArtifactTemplateKind;
  name: string;
  mime_type: string;
  template_content: string;
  placeholders: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const loadActiveTemplate = async (input: {
  kind: ArtifactTemplateKind;
  userId?: string;
}): Promise<ArtifactTemplate | null> => {
  if (!hasSupabaseAdmin()) return null;

  try {
    const rows = await supabaseAdminRequest<ArtifactTemplate[]>({
      path: 'artifact_templates',
      query: {
        select:
          'id,user_id,kind,name,mime_type,template_content,placeholders,is_active,created_at,updated_at',
        kind: `eq.${input.kind}`,
        is_active: 'eq.true',
        order: 'updated_at.desc',
        limit: '20',
      },
    });

    if (!Array.isArray(rows) || rows.length === 0) return null;
    if (!input.userId) {
      return rows.find((row) => !row.user_id) || rows[0];
    }
    return rows.find((row) => row.user_id === input.userId) || rows.find((row) => !row.user_id) || rows[0];
  } catch (error) {
    if (isSupabaseMissingTableError(error, 'artifact_templates')) {
      return null;
    }
    throw error;
  }
};

export const renderTemplate = (
  template: string,
  values: Record<string, string>,
) =>
  String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_all, token) => {
    const key = String(token || '').trim();
    return key in values ? String(values[key] || '') : '';
  });
