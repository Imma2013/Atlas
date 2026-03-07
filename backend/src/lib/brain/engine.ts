import { generateDeckOutline } from '@/lib/deck';
import { createActivityItem } from '@/lib/activity';
import { callOpenRouterChat } from '@/lib/openrouter';
import { PLAN_CONFIGS } from '@/lib/plans';
import { createDriveFile } from '@/lib/microsoft';
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

  const wantsFileOutput = /\b(make|create|turn|convert|export|save)\b/i.test(input.query);
  const wantsWordOutput =
    wantsFileOutput && /\b(word|doc|docx|document)\b/i.test(input.query);
  const wantsExcelOutput =
    wantsFileOutput && /\b(excel|spreadsheet|csv)\b/i.test(input.query);
  const wantsPowerPointOutput =
    wantsFileOutput && /\b(powerpoint|ppt|slides?|deck)\b/i.test(input.query);

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

  if (input.microsoftAccessToken && (wantsWordOutput || wantsExcelOutput || wantsPowerPointOutput)) {
    const stampedDate = new Date().toISOString().slice(0, 10);
    const renderedOutput = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    const exportedLinks: string[] = [];

    if (wantsWordOutput) {
      const doc = await createDriveFile({
        accessToken: input.microsoftAccessToken,
        fileName: `Atlas-Document-${stampedDate}.doc`,
        content: `<!doctype html><html><head><meta charset="utf-8"></head><body><pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif;font-size:12pt;">${renderedOutput
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</pre></body></html>`,
        contentType: 'text/html; charset=utf-8',
      });
      if (doc.webUrl) {
        exportedLinks.push(`Word: ${doc.webUrl}`);
        activityLinks.word = doc.webUrl;
        activityLinks.onedrive = doc.webUrl;
      }
    }

    if (wantsExcelOutput) {
      const excelCsv = `Section,Details\n"Summary","${renderedOutput.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      const csv = await createDriveFile({
        accessToken: input.microsoftAccessToken,
        fileName: `Atlas-Spreadsheet-${stampedDate}.csv`,
        content: excelCsv,
        contentType: 'text/csv; charset=utf-8',
      });
      if (csv.webUrl) {
        exportedLinks.push(`Excel (CSV): ${csv.webUrl}`);
        activityLinks.excel = csv.webUrl;
        activityLinks.onedrive = activityLinks.onedrive || csv.webUrl;
      }
    }

    if (wantsPowerPointOutput) {
      const deckOutline = `# Atlas Deck Outline\n\n${renderedOutput}`;
      const deck = await createDriveFile({
        accessToken: input.microsoftAccessToken,
        fileName: `Atlas-Deck-Outline-${stampedDate}.md`,
        content: deckOutline,
        contentType: 'text/markdown; charset=utf-8',
      });
      if (deck.webUrl) {
        exportedLinks.push(`PowerPoint outline: ${deck.webUrl}`);
        activityLinks.powerpoint = deck.webUrl;
        activityLinks.onedrive = activityLinks.onedrive || deck.webUrl;
      }
    }

    if (exportedLinks.length > 0) {
      output = `${renderedOutput}\n\nCreated files:\n${exportedLinks.join('\n')}`;
    }
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
