import { generateDeckOutline } from '@/lib/deck';
import { createActivityItem } from '@/lib/activity';
import { callOpenRouterChat } from '@/lib/openrouter';
import { PLAN_CONFIGS } from '@/lib/plans';
import {
  BrainIntent,
  classifyIntent,
  defaultRouterModelConfig,
  RouterModelConfig,
} from '@/lib/router';
import { searchWeb, searchWorkspace } from '@/lib/search';
import { summarizeText } from '@/lib/summaries';
import { AIActionType, assertUsageWithinPlan, recordAIUsage } from '@/lib/usage';
import { GROUNDED_SYSTEM_RULES } from '@/lib/prompts/grounding';

export type BrainExecutionInput = {
  query: string;
  microsoftAccessToken?: string;
  userId?: string;
  models?: Partial<RouterModelConfig>;
  sources?: string[];
};

const mergeModels = (models?: Partial<RouterModelConfig>): RouterModelConfig => ({
  ...defaultRouterModelConfig,
  ...(models || {}),
});

export const executeBrainFlow = async (input: BrainExecutionInput) => {
  const models = mergeModels(input.models);
  const selectedSources = new Set(input.sources || []);
  const webEnabled = selectedSources.has('web');
  const workspaceEnabled =
    selectedSources.has('workspace') || selectedSources.size === 0;
  const usageCheck = await assertUsageWithinPlan(input.userId);

  if (!usageCheck.allowed) {
    return {
      intent: 'unknown' as BrainIntent,
      output: `Monthly AI action limit reached for ${usageCheck.tier} plan (${usageCheck.used}/${usageCheck.limit}).`,
      blocked: true,
    };
  }

  const intent = await classifyIntent(input.query, models.routerModel);
  const effectiveIntent: BrainIntent =
    intent === 'search_web' && !webEnabled
      ? 'search_workspace'
      : intent === 'unknown' && workspaceEnabled
        ? 'search_workspace'
        : intent === 'unknown' && webEnabled
          ? 'search_web'
          : intent;
  const tierConfig = PLAN_CONFIGS[usageCheck.tier];
  const requiresBigModel =
    effectiveIntent === 'generate_deck' || effectiveIntent === 'analyze_spreadsheet';

  if (requiresBigModel && !tierConfig.allowBigModel) {
    return {
      intent,
      output: `${usageCheck.tier} plan does not include Opus 4 actions. Upgrade to Pro or higher.`,
      blocked: true,
    };
  }
  let actionType: AIActionType = 'summary';
  let modelUsed = models.midModel;
  let activityType: 'meeting' | 'email' | 'file' | 'deck' | 'spreadsheet' | 'web_search' = 'web_search';
  let activityLinks: Record<string, string> = {};
  let output: unknown;

  switch (effectiveIntent) {
    case 'summarize_meeting':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'meeting';
      activityLinks = { teams: 'https://teams.microsoft.com' };
      output = await summarizeText({
        content: input.query,
        context: 'a meeting transcript or notes',
        model: models.midModel,
      });
      break;
    case 'summarize_email':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'email';
      activityLinks = { outlook: 'https://outlook.office.com/mail/' };
      output = await summarizeText({
        content: input.query,
        context: 'an email thread',
        model: models.midModel,
      });
      break;
    case 'summarize_file':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'file';
      activityLinks = { word: 'https://www.office.com/launch/word' };
      output = await summarizeText({
        content: input.query,
        context: 'a file',
        model: models.midModel,
      });
      break;
    case 'search_workspace':
      if (!input.microsoftAccessToken) {
        return {
          intent: effectiveIntent,
          output: webEnabled
            ? 'Microsoft is not connected. Connect Apps for workspace answers or disable workspace and use web.'
            : 'Microsoft access token is required for workspace search. Connect Microsoft in Apps.',
          requiresAuth: true,
        };
      }
      actionType = 'search';
      modelUsed = models.midModel;
      activityType = 'file';
      output = await searchWorkspace({
        accessToken: input.microsoftAccessToken,
        query: input.query,
      });
      {
        const workspace = output as any;
        activityLinks = {
          outlook:
            workspace?.emails?.[0]?.links?.outlook || 'https://outlook.office.com/mail/',
          onedrive:
            workspace?.files?.[0]?.links?.onedrive || 'https://onedrive.live.com/',
          teams:
            workspace?.events?.[0]?.links?.teams || 'https://teams.microsoft.com',
        };
      }
      break;
    case 'search_web':
      if (!webEnabled) {
        return {
          intent: effectiveIntent,
          output:
            'Web search is currently off. Enable the Web source toggle to include internet results.',
        };
      }
      actionType = 'search';
      modelUsed = models.midModel;
      activityType = 'web_search';
      output = await searchWeb({ query: input.query, model: models.midModel });
      break;
    case 'draft_email':
      actionType = 'draft';
      modelUsed = models.midModel;
      activityType = 'email';
      activityLinks = { outlook: 'https://outlook.office.com/mail/' };
      output = await callOpenRouterChat({
        model: models.midModel,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'Draft a concise professional email.' },
          { role: 'user', content: input.query },
        ],
      });
      break;
    case 'generate_deck':
      actionType = 'deck';
      modelUsed = models.bigModel;
      activityType = 'deck';
      activityLinks = { powerpoint: 'https://www.office.com/launch/powerpoint' };
      output = await generateDeckOutline({
        topic: input.query,
        source: input.query,
        model: models.bigModel,
      });
      break;
    case 'analyze_spreadsheet':
      actionType = 'analysis';
      modelUsed = models.bigModel;
      activityType = 'spreadsheet';
      activityLinks = { excel: 'https://www.office.com/launch/excel' };
      output = await callOpenRouterChat({
        model: models.bigModel,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `${GROUNDED_SYSTEM_RULES}\nAnalyze spreadsheet context and return key metrics, trends, risks, and recommended actions.`,
          },
          { role: 'user', content: input.query },
        ],
      });
      break;
    default:
      return {
        intent: 'unknown',
        output:
          'I need a clearer task. Try: summarize email, summarize file, search workspace, or enable Web and search web.',
      };
  }

  await Promise.all([
    recordAIUsage({
      userId: input.userId,
      actionType,
      modelUsed,
    }),
    createActivityItem({
      userId: input.userId,
      type: activityType,
      sourceId: crypto.randomUUID(),
      title: input.query.slice(0, 120),
      summary: typeof output === 'string' ? output : JSON.stringify(output),
      links: activityLinks,
      modelUsed,
    }),
  ]);

  return {
    intent: effectiveIntent,
    output,
    modelUsed,
  };
};
