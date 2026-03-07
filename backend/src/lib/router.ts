export type BrainIntent =
  | 'summarize_meeting'
  | 'summarize_email'
  | 'summarize_file'
  | 'search_workspace'
  | 'search_web'
  | 'draft_email'
  | 'generate_deck'
  | 'analyze_spreadsheet'
  | 'unknown';

export type RouterModelConfig = {
  routerModel: string;
  midModel: string;
  bigModel: string;
};

const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
const hasGemini = Boolean(process.env.GEMINI_API_KEY);

export const defaultRouterModelConfig: RouterModelConfig = {
  routerModel:
    process.env.ATLAS_ROUTER_MODEL ||
    process.env.OPENROUTER_ROUTER_MODEL ||
    (hasGemini ? 'gemini/gemini-2.5-flash-lite' : 'anthropic/claude-haiku-4.5'),
  midModel:
    process.env.ATLAS_MID_MODEL ||
    process.env.OPENROUTER_MID_MODEL ||
    (hasAnthropic ? 'anthropic/claude-sonnet-4' : 'gemini/gemini-2.5-flash'),
  bigModel:
    process.env.ATLAS_BIG_MODEL ||
    process.env.OPENROUTER_BIG_MODEL ||
    (hasAnthropic ? 'anthropic/claude-opus-4' : 'gemini/gemini-2.5-pro'),
};

const intentLabels: BrainIntent[] = [
  'summarize_meeting',
  'summarize_email',
  'summarize_file',
  'search_workspace',
  'search_web',
  'draft_email',
  'generate_deck',
  'analyze_spreadsheet',
  'unknown',
];

const routerPrompt = `Classify the user request into one of these intents:

- summarize_meeting
- summarize_email
- summarize_file
- search_workspace
- search_web
- draft_email
- generate_deck
- analyze_spreadsheet
- unknown

Return ONLY the label.`;

const keywordFallback = (query: string): BrainIntent => {
  const q = query.toLowerCase();

  if (q.includes('meeting') || q.includes('transcript')) return 'summarize_meeting';
  if (q.includes('email') && q.includes('draft')) return 'draft_email';
  if (q.includes('email')) return 'summarize_email';
  if (q.includes('deck') || q.includes('slide')) return 'generate_deck';
  if (q.includes('spreadsheet') || q.includes('excel')) return 'analyze_spreadsheet';
  if (q.includes('file') || q.includes('document') || q.includes('onedrive')) return 'summarize_file';
  if (
    q.includes('workspace') ||
    q.includes('outlook') ||
    q.includes('teams') ||
    q.includes('my email') ||
    q.includes('my files') ||
    q.includes('my calendar')
  ) {
    return 'search_workspace';
  }

  return 'search_web';
};

import { callOpenRouterChat } from '@/lib/openrouter';

export const classifyIntent = async (
  query: string,
  model = defaultRouterModelConfig.routerModel,
): Promise<BrainIntent> => {
  try {
    const label = (
      await callOpenRouterChat({
        model,
        temperature: 0,
        maxTokens: 16,
        messages: [
          { role: 'system', content: routerPrompt },
          { role: 'user', content: query },
        ],
      })
    )
      .trim()
      .toLowerCase() as BrainIntent;

    if (intentLabels.includes(label) && label !== 'unknown') {
      return label;
    }

    return keywordFallback(query);
  } catch {
    return keywordFallback(query);
  }
};
