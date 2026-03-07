import { hasSupabaseAdmin, supabaseAdminRequest } from '@/lib/supabase';

export type ActivityType = 'meeting' | 'email' | 'file' | 'deck' | 'spreadsheet' | 'web_search';

export const createActivityItem = async (input: {
  userId?: string;
  type: ActivityType;
  sourceId: string;
  title: string;
  summary: string;
  actionItems?: unknown[];
  decisions?: unknown[];
  links?: Record<string, string>;
  modelUsed: string;
}) => {
  if (!input.userId || !hasSupabaseAdmin()) {
    return;
  }

  await supabaseAdminRequest({
    path: 'activity_items',
    method: 'POST',
    body: {
      user_id: input.userId,
      type: input.type,
      source_id: input.sourceId,
      title: input.title,
      summary: input.summary,
      action_items: input.actionItems || [],
      decisions: input.decisions || [],
      links: input.links || {},
      model_used: input.modelUsed,
    },
  });
};