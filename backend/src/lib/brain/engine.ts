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

export type BrainExecutionInput = {
  query: string;
  microsoftAccessToken?: string;
  userId?: string;
  models?: Partial<RouterModelConfig>;
};

const mergeModels = (models?: Partial<RouterModelConfig>): RouterModelConfig => ({
  ...defaultRouterModelConfig,
  ...(models || {}),
});

export const executeBrainFlow = async (input: BrainExecutionInput) => {
  const models = mergeModels(input.models);
  const usageCheck = await assertUsageWithinPlan(input.userId);

  if (!usageCheck.allowed) {
    return {
      intent: 'unknown' as BrainIntent,
      output: `Monthly AI action limit reached for ${usageCheck.tier} plan (${usageCheck.used}/${usageCheck.limit}).`,
      blocked: true,
    };
  }

  const intent = await classifyIntent(input.query, models.routerModel);
  const tierConfig = PLAN_CONFIGS[usageCheck.tier];
  const requiresBigModel =
    intent === 'generate_deck' || intent === 'analyze_spreadsheet';

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
  let output: unknown;

  switch (intent) {
    case 'summarize_meeting':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'meeting';
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
      output = await summarizeText({
        content: input.query,
        context: 'a file',
        model: models.midModel,
      });
      break;
    case 'search_workspace':
      if (!input.microsoftAccessToken) {
        return {
          intent,
          output: 'Microsoft access token is required for workspace search.',
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
      break;
    case 'search_web':
      actionType = 'search';
      modelUsed = models.midModel;
      activityType = 'web_search';
      output = await searchWeb({ query: input.query, model: models.midModel });
      break;
    case 'draft_email':
      actionType = 'draft';
      modelUsed = models.midModel;
      activityType = 'email';
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
      output = await callOpenRouterChat({
        model: models.bigModel,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Analyze spreadsheet context and return key metrics, trends, risks, and recommended actions.',
          },
          { role: 'user', content: input.query },
        ],
      });
      break;
    default:
      return {
        intent: 'unknown' as BrainIntent,
        output:
          'I need clarification. Do you want meeting/email/file summary, workspace search, web search, email draft, deck generation, or spreadsheet analysis?',
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
      modelUsed,
    }),
  ]);

  return {
    intent,
    output,
    modelUsed,
  };
};
