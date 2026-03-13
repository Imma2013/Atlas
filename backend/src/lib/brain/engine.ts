import { generateDeckOutline } from '@/lib/deck';
import { createActivityItem } from '@/lib/activity';
import { callOpenRouterChat } from '@/lib/openrouter';
import { createCalendarEvent, createDriveFile, updateDriveFileContent } from '@/lib/microsoft';
import {
  createGoogleDocFromText,
  createGoogleSheetFromText,
  createGoogleSlidesFromText,
} from '@/lib/google';
import {
  createPresentationFromText,
  createWorkbookFromText,
  extractWorkbookText,
} from '@/lib/officeArtifacts';
import {
  BrainIntent,
  defaultRouterModelConfig,
  inferIntentFromMcpServers,
  MCPServer,
  routeMcpServers,
  RouterModelConfig,
} from '@/lib/router';
import { searchGoogleWorkspace, searchWeb, searchWorkspace } from '@/lib/search';
import { summarizeText } from '@/lib/summaries';
import { AIActionType, assertUsageWithinPlan, recordAIUsage } from '@/lib/usage';
import { GROUNDED_SYSTEM_RULES } from '@/lib/prompts/grounding';
import { loadActiveTemplate, renderTemplate } from '@/lib/templates';
import {
  enforceToolCardLimit,
  loadGoogleServersForPrompt,
  loadMcpServersForRoute,
  selectToolsForPrompt,
  toCompressedToolCards,
} from '@/lib/mcp/servers';

export type BrainExecutionInput = {
  query: string;
  chatId?: string;
  microsoftAccessToken?: string;
  googleAccessToken?: string;
  userId?: string;
  fileIds?: string[];
  uploadedFileContext?: Array<{ fileName?: string; initialContent?: string }>;
  artifactContext?: Array<{
    kind: 'word' | 'excel' | 'powerpoint';
    fileName?: string;
    webUrl?: string;
    driveItemId?: string;
    origin?: 'microsoft' | 'google' | 'local';
  }>;
  models?: Partial<RouterModelConfig>;
  sources?: string[];
  history?: Array<[string, string]>;
};

export type GeneratedDownload = {
  kind: 'word' | 'excel' | 'powerpoint';
  fileName: string;
  mimeType: string;
  contentBase64?: string;
  webUrl?: string;
  driveItemId?: string;
  origin: 'microsoft' | 'google' | 'local';
  previewText?: string;
};

type WebResultCard = {
  name: string;
  url: string;
  snippet: string;
  reason: string;
};

const isLikelyStaleLink = (url: string, snippet: string) => {
  const u = url.toLowerCase();
  if (!u.startsWith('http')) return true;
  if (u.includes('javascript:')) return true;
  if (u.includes('/search?') || u.includes('bing.com/search') || u.includes('duckduckgo.com/?')) {
    return true;
  }
  return snippet.trim().length < 20;
};

const toReason = (snippet: string, title: string) => {
  const cleaned = String(snippet || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length >= 24) return cleaned.slice(0, 220);
  return `Covers ${title} with supporting details.`;
};

export type PendingDraft = {
  provider: 'outlook' | 'gmail';
  to: string[];
  subject: string;
  body: string;
  contentType: 'Text' | 'HTML';
};

const stripInternalArtifacts = (text: string) => {
  return text
    .replace(/<use_mcp_tool>[\s\S]*?<\/use_mcp_tool>/gi, '')
    .replace(/<server_name>[\s\S]*?<\/server_name>/gi, '')
    .replace(/<tool_name>[\s\S]*?<\/tool_name>/gi, '')
    .replace(/<arguments>[\s\S]*?<\/arguments>/gi, '')
    .replace(/\bROUTER DECISION\b[\s\S]*$/i, '')
    .trim();
};

const buildExecutionRules = (cards: string[]) => {
  const toolBlock = cards.length > 0 ? cards.join('\n') : 'Tool not available.';
  return [
    'You are the execution model.',
    'RULES:',
    '- Only use the tools provided.',
    '- Do NOT invent tools.',
    '- Do NOT invent parameters.',
    '- Do NOT call tools not listed.',
    '- Do NOT generate code.',
    '- Do NOT generate UI.',
    '- Do NOT plan beyond the current step.',
    '- Do NOT hallucinate.',
    'TOOLS AVAILABLE:',
    toolBlock,
  ].join('\n');
};

const mergeModels = (models?: Partial<RouterModelConfig>): RouterModelConfig => ({
  ...defaultRouterModelConfig,
  ...(models || {}),
});

const formatHistoryContext = (history: Array<[string, string]> = []) => {
  if (history.length === 0) return '';

  const recent = history.slice(-6);
  return recent
    .map(([role, text]) => `${role === 'human' ? 'User' : 'Assistant'}: ${text}`)
    .join('\n');
};

const formatWorkspaceContext = (workspace: any) => {
  const emails = (workspace?.emails || []).slice(0, 3).map((item: any) => ({
    subject: item.subject || '',
    preview: item.bodyPreview || item.summary || '',
    from:
      item.from?.emailAddress?.name ||
      item.from?.emailAddress?.address ||
      item.sender?.emailAddress?.address ||
      '',
    link: item.links?.outlook || item.webLink || '',
  }));

  const files = (workspace?.files || []).slice(0, 3).map((item: any) => ({
    name: item.name || '',
    summary: item.summary || '',
    link: item.links?.onedrive || item.webUrl || '',
  }));

  const events = (workspace?.events || []).slice(0, 3).map((item: any) => ({
    subject: item.subject || '',
    start: item.start?.dateTime || '',
    end: item.end?.dateTime || '',
    link: item.links?.teams || item.onlineMeetingUrl || item.webLink || '',
  }));

  return JSON.stringify({ emails, files, events }, null, 2);
};

const formatUploadedFileContext = (
  files: Array<{ fileName?: string; initialContent?: string }> = [],
) => {
  const normalized = files
    .map((file) => ({
      fileName: String(file.fileName || 'Uploaded file').trim(),
      initialContent: String(file.initialContent || '').trim(),
    }))
    .filter((file) => file.initialContent.length > 0)
    .slice(0, 8);

  if (normalized.length === 0) return '';

  return JSON.stringify(
    normalized.map((file) => ({
      fileName: file.fileName,
      preview: file.initialContent,
    })),
    null,
    2,
  );
};

const mergeWorkspaceSnapshots = (input: {
  microsoft?: any | null;
  google?: any | null;
}) => {
  const m = input.microsoft || {};
  const g = input.google || {};

  return {
    emails: [...(m.emails || []), ...(g.emails || [])].slice(0, 8),
    files: [...(m.files || []), ...(g.files || [])].slice(0, 8),
    events: [...(m.events || []), ...(g.events || [])].slice(0, 8),
  };
};

const resolveActionTypeForIntent = (intent: BrainIntent): AIActionType => {
  if (intent === 'search_workspace' || intent === 'search_web') return 'search';
  if (intent === 'generate_deck') return 'deck';
  if (intent === 'analyze_spreadsheet') return 'analysis';
  if (intent === 'draft_email') return 'draft';
  return 'summary';
};

const toBase64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const toWordHtml = (text: string, title: string) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim());
  const bodyParts: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      bodyParts.push('</ul>');
      inList = false;
    }
  };
  lines.forEach((line) => {
    if (!line) {
      closeList();
      return;
    }
    const safe = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (!inList) {
        bodyParts.push('<ul>');
        inList = true;
      }
      bodyParts.push(`<li>${safe.replace(/^[-*•]\s+|^\d+\.\s+/, '')}</li>`);
      return;
    }
    closeList();
    if (/^[A-Za-z0-9][A-Za-z0-9 \-]{1,80}:$/.test(line)) {
      bodyParts.push(`<h2>${safe.replace(/:$/, '')}</h2>`);
      return;
    }
    bodyParts.push(`<p>${safe}</p>`);
  });
  closeList();

  const safeTitle = String(title || 'Atlas Document')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Calibri,Segoe UI,Arial,sans-serif;font-size:12pt;line-height:1.55;color:#111;margin:0;padding:36px;}
h1{font-size:24pt;line-height:1.2;margin:0 0 14px;}
h2{font-size:14pt;line-height:1.35;margin:16px 0 8px;}
p{margin:0 0 10px;}
ul{margin:0 0 12px 18px;padding:0;}
li{margin:0 0 6px;}
</style></head><body><h1>${safeTitle}</h1>${bodyParts.join('')}</body></html>`;
};

const extractSingleWordRequest = (query: string) => {
  const match = query.match(/\bjust\s+(?:the\s+)?word\s+["']?([a-z0-9_-]+)["']?/i);
  return match?.[1] || null;
};

const extractRequestedTitle = (query: string, fallback: string) => {
  const named = query.match(/\b(?:named|titled|title)\s+["']?([a-z0-9 _-]{2,80})["']?/i);
  if (named?.[1]) return named[1].trim();
  return fallback;
};

const extractEmailsFromText = (...parts: string[]) => {
  const matches = parts
    .join('\n')
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (!matches) return [];
  return Array.from(
    new Set(matches.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 6);
};

const extractDirectBody = (query: string) => {
  const withMatch = query.match(/\bwith\b\s+["']?(.+?)["']?$/i);
  if (withMatch?.[1]) return withMatch[1].trim();
  const saysMatch = query.match(/\b(?:saying|that says|containing)\b\s+["']?(.+?)["']?$/i);
  if (saysMatch?.[1]) return saysMatch[1].trim();
  return null;
};

const extractRequestedSlideCount = (query: string, fallback = 6) => {
  const match = query.match(/\b(\d{1,2})\s*(?:slides?|pages?)\b/i);
  if (!match) return fallback;
  const requested = Number(match[1]);
  if (!Number.isFinite(requested)) return fallback;
  return Math.min(15, Math.max(2, requested));
};

const cleanDeckTitle = (query: string) => {
  const base = extractRequestedTitle(query, 'Atlas Presentation');
  return base
    .replace(/\b(make|create|build|generate|turn)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Atlas Presentation';
};

type CalendarEventDraft = {
  subject: string;
  startIso: string;
  endIso: string;
  body?: string;
  location?: string;
};

const parseCalendarEventDrafts = (text: string): CalendarEventDraft[] => {
  try {
    const matched = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!matched) return [];
    const parsed = JSON.parse(matched[0]) as any;
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : [];
    return items
      .map((item: any) => ({
        subject: String(item?.subject || '').trim(),
        startIso: String(item?.startIso || '').trim(),
        endIso: String(item?.endIso || '').trim(),
        body: item?.body ? String(item.body) : undefined,
        location: item?.location ? String(item.location) : undefined,
      }))
      .filter((item: CalendarEventDraft) => item.subject && item.startIso && item.endIso)
      .slice(0, 12);
  } catch {
    return [];
  }
};

const generateStandaloneDocument = async (input: {
  model: string;
  query: string;
  workspaceContextText: string;
  conversationContext: string;
}) => {
  const directBody = extractDirectBody(input.query);
  if (directBody) {
    return directBody;
  }

  const forcedWord = extractSingleWordRequest(input.query);
  if (forcedWord) {
    return forcedWord;
  }

  return callOpenRouterChat({
    model: input.model,
    temperature: 0.25,
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content:
          'You are writing document content only. Never explain platform limitations or mention inability. Return only the document body text.',
      },
      {
        role: 'user',
        content: [
          `Request: ${input.query}`,
          input.conversationContext
            ? `Conversation:\n${input.conversationContext}`
            : '',
          input.workspaceContextText
            ? `Workspace Context:\n${input.workspaceContextText}`
            : '',
          'Write a polished document draft directly from this request.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
  });
};

const extractFirstMarkdownTable = (text: string) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tableLines: string[] = [];

  for (const line of lines) {
    if (!line.includes('|')) {
      if (tableLines.length >= 2) break;
      continue;
    }
    tableLines.push(line);
  }

  if (tableLines.length < 2) return '';
  return tableLines.join('\n');
};

const generateArtifactContent = async (input: {
  model: string;
  mode: 'word' | 'excel' | 'powerpoint';
  query: string;
  currentOutput: string;
  conversationContext: string;
  workspaceContextText: string;
  uploadedFileContextText: string;
  sourceCardsText?: string;
}) => {
  const modeInstruction =
    input.mode === 'excel'
      ? 'Return only one markdown table with a header row and real rows. No prose before or after.'
      : input.mode === 'powerpoint'
        ? 'Return slide-ready content: "Slide 1: Title" then bullet points. Keep facts concrete and concise.'
        : 'Return only clean document body text that directly fulfills the request.';

  try {
    const generated = await callOpenRouterChat({
      model: input.model,
      temperature: 0.15,
      maxTokens: input.mode === 'excel' ? 1200 : 1000,
      messages: [
        {
          role: 'system',
          content: `${GROUNDED_SYSTEM_RULES}\n${modeInstruction}`,
        },
        {
          role: 'user',
          content: [
            `User request: ${input.query}`,
            input.conversationContext ? `Conversation:\n${input.conversationContext}` : '',
            input.workspaceContextText ? `Workspace context:\n${input.workspaceContextText}` : '',
            input.uploadedFileContextText
              ? `Uploaded files context:\n${input.uploadedFileContextText}`
              : '',
            input.sourceCardsText ? `Web references:\n${input.sourceCardsText}` : '',
            `Current AI output:\n${input.currentOutput}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });
    const cleaned = stripInternalArtifacts(generated);

    if (input.mode === 'excel') {
      const table = extractFirstMarkdownTable(cleaned);
      if (table) return table;
      const fallbackTable = extractFirstMarkdownTable(input.currentOutput);
      if (fallbackTable) return fallbackTable;
    }

    return cleaned || input.currentOutput;
  } catch {
    if (input.mode === 'excel') {
      const fallbackTable = extractFirstMarkdownTable(input.currentOutput);
      if (fallbackTable) return fallbackTable;
    }
    return input.currentOutput;
  }
};

const toSourceCardsText = (sources: WebResultCard[] = []) =>
  sources
    .slice(0, 8)
    .map(
      (item, index) =>
        `${index + 1}. ${item.name}\nURL: ${item.url}\nWhy: ${item.reason || item.snippet || 'Relevant supporting source.'}`,
    )
    .join('\n\n');

const toTemplateValues = (input: {
  title: string;
  content: string;
  sourcesSection: string;
}) => ({
  title: input.title,
  content: input.content,
  sources: input.sourcesSection,
  generated_at: new Date().toISOString(),
});

export const executeBrainFlow = async (input: BrainExecutionInput) => {
  const models = mergeModels(input.models);
  const conversationContext = formatHistoryContext(input.history);
  const routerPrompt = conversationContext
    ? `Recent conversation:\n${conversationContext}\n\nCurrent request:\n${input.query}`
    : input.query;
  const selectedSources = new Set(input.sources || []);
  const webEnabled = selectedSources.has('web');
  const workspaceEnabled =
    selectedSources.has('workspace') || selectedSources.size === 0;
  const wantsFileOutput = /\b(make|create|turn|convert|export|save|write|build|generate)\b/i.test(
    input.query,
  );
  const wantsWordOutput =
    wantsFileOutput && /\b(word|doc|docx|document)\b/i.test(input.query);
  const referencesExcelAsSource = /\bfrom\s+excel\b|\bexcel\s+rows?\b|\bexcel\s+data\b/i.test(
    input.query,
  );
  const wantsExcelOutput =
    wantsFileOutput &&
    /\b(excel|spreadsheet|csv)\b/i.test(input.query) &&
    !referencesExcelAsSource;
  const wantsPowerPointOutput =
    wantsFileOutput && /\b(powerpoint|ppt|slides?|deck|presentation)\b/i.test(input.query);
  const wantsDeckUpdate =
    wantsPowerPointOutput &&
    /\b(update|edit|revise|modify|refresh|replace|add images?|add pictures?|insert images?)\b/i.test(
      input.query,
    );
  const wantsCalendarAutomation =
    /\b(calendar|event|schedule)\b/i.test(input.query) &&
    /\b(create|add|plan|build|make|convert|turn)\b/i.test(input.query);
  const requestedSlideCount = extractRequestedSlideCount(input.query, 6);
  const latestPowerPointArtifact = (input.artifactContext || []).find(
    (artifact) =>
      artifact.kind === 'powerpoint' &&
      artifact.origin === 'microsoft' &&
      Boolean(artifact.driveItemId),
  );
  const explicitCreateRequest =
    wantsFileOutput && (wantsWordOutput || wantsExcelOutput || wantsPowerPointOutput);

  const route = await routeMcpServers(routerPrompt, models.routerModel);
  const routeLoadedServers = loadMcpServersForRoute(route.required_mcp_servers);
  const intent = inferIntentFromMcpServers(routerPrompt, route.required_mcp_servers, webEnabled);
  let effectiveIntent: BrainIntent =
    intent === 'search_web' && !webEnabled
      ? 'search_workspace'
      : intent === 'unknown' && webEnabled
          ? 'search_web'
        : intent === 'unknown' && workspaceEnabled
          ? 'search_workspace'
          : intent;

  if (explicitCreateRequest) {
    if (wantsPowerPointOutput) {
      effectiveIntent = 'generate_deck';
    } else if (wantsExcelOutput) {
      effectiveIntent = 'analyze_spreadsheet';
    } else {
      effectiveIntent = 'summarize_file';
    }
  }
  const actionTypeForRequest = resolveActionTypeForIntent(effectiveIntent);
  const disableBillingEnforcement = /^(1|true)$/i.test(
    String(process.env.ATLAS_DISABLE_BILLING_ENFORCEMENT || ''),
  );
  const usage = disableBillingEnforcement
    ? { allowed: true as const, tier: 'free' as const, used: 0, limit: null as number | null }
    : await assertUsageWithinPlan(input.userId);
  if (!usage.allowed) {
    return {
      intent: effectiveIntent,
      output: `Monthly AI action limit reached for ${usage.tier} plan (${usage.used}/${usage.limit}). Upgrade in Billing to continue.`,
      blockedByUsageCap: true,
      usage: {
        tier: usage.tier,
        used: usage.used,
        limit: usage.limit,
        remaining: 0,
      },
    };
  }

  const microsoftLoadedServers = selectToolsForPrompt({
    intent: effectiveIntent,
    query: routerPrompt,
    loaded: routeLoadedServers,
  });
  const googleLoadedServers = loadGoogleServersForPrompt({
    enabled: Boolean(input.googleAccessToken),
    intent: effectiveIntent,
    query: routerPrompt,
  });
  const toolCardLimit = Number(process.env.ATLAS_TOOL_CARD_LIMIT || '8');
  const loadedMcpServers = enforceToolCardLimit(
    [...microsoftLoadedServers, ...googleLoadedServers],
    Number.isFinite(toolCardLimit) ? toolCardLimit : 8,
  );
  const executionRules = buildExecutionRules(
    toCompressedToolCards(loadedMcpServers),
  );

  let workspaceSnapshot: any = null;
  const uploadedFileContextText = formatUploadedFileContext(input.uploadedFileContext || []);

  if (workspaceEnabled) {
    const [microsoftSnapshot, googleSnapshot] = await Promise.all([
      (async () => {
        if (!input.microsoftAccessToken) return null;
        try {
          return await searchWorkspace({
            accessToken: input.microsoftAccessToken,
            query: input.query,
          });
        } catch {
          return null;
        }
      })(),
      (async () => {
        if (!input.googleAccessToken) return null;
        try {
          return await searchGoogleWorkspace({
            accessToken: input.googleAccessToken,
            query: input.query,
          });
        } catch {
          return null;
        }
      })(),
    ]);

    workspaceSnapshot = mergeWorkspaceSnapshots({
      microsoft: microsoftSnapshot,
      google: googleSnapshot,
    });
  }

  const workspaceContextText = workspaceSnapshot
    ? formatWorkspaceContext(workspaceSnapshot)
    : '';
  const hasWorkspaceData = Boolean(
    workspaceSnapshot &&
      ((workspaceSnapshot.emails && workspaceSnapshot.emails.length > 0) ||
        (workspaceSnapshot.files && workspaceSnapshot.files.length > 0) ||
        (workspaceSnapshot.events && workspaceSnapshot.events.length > 0)),
  );
  const hasUploadedFileData = uploadedFileContextText.length > 0;

  const buildContextualPrompt = (task: string) =>
    [
      task,
      conversationContext ? `Recent conversation:\n${conversationContext}` : '',
      workspaceContextText ? `Workspace context (emails/files/events):\n${workspaceContextText}` : '',
      hasUploadedFileData ? `Uploaded file context:\n${uploadedFileContextText}` : '',
      `Current request:\n${input.query}`,
    ]
      .filter(Boolean)
      .join('\n\n');

  let actionType: AIActionType = actionTypeForRequest;
  let modelUsed = models.midModel;
  let activityType: 'meeting' | 'email' | 'file' | 'deck' | 'spreadsheet' | 'web_search' = 'web_search';
  let activityLinks: Record<string, string> = {};
  let output: unknown;
  const downloads: GeneratedDownload[] = [];
  let pendingDraft: PendingDraft | undefined;
  let webResults: WebResultCard[] | undefined;
  let webFollowUps: string[] | undefined;

  switch (effectiveIntent) {
    case 'summarize_meeting':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'meeting';
      activityLinks = { teams: 'https://teams.microsoft.com' };
      output = await summarizeText({
        content: buildContextualPrompt('Summarize the meeting and list clear action items.'),
        context: 'a meeting transcript or notes',
        model: models.midModel,
      });
      break;
    case 'summarize_email':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'email';
      activityLinks = {
        ...(input.microsoftAccessToken ? { outlook: 'https://outlook.office.com/mail/' } : {}),
        ...(input.googleAccessToken ? { gmail: 'https://mail.google.com/' } : {}),
      };
      output = await summarizeText({
        content: buildContextualPrompt(
          'Summarize the relevant email thread and include decisions, asks, and follow-ups.',
        ),
        context: 'an email thread',
        model: models.midModel,
      });
      break;
    case 'summarize_file':
      actionType = 'summary';
      modelUsed = models.midModel;
      activityType = 'file';
      activityLinks = { word: 'https://www.office.com/launch/word' };
      if (wantsFileOutput && !hasWorkspaceData && !hasUploadedFileData) {
        output = await generateStandaloneDocument({
          model: models.midModel,
          query: input.query,
          workspaceContextText,
          conversationContext,
        });
      } else {
        output = await summarizeText({
          content: buildContextualPrompt(
            'Summarize the relevant file content and highlight key facts, deadlines, and risks.',
          ),
          context: 'a file',
          model: models.midModel,
        });
      }

      break;
    case 'search_workspace':
      if (!input.microsoftAccessToken && !input.googleAccessToken) {
        return {
          intent: effectiveIntent,
          output: webEnabled
            ? 'No workspace provider is connected. Connect Microsoft or Google in Settings > Connections, or disable workspace and use web.'
            : 'Workspace token is required for workspace search. Connect Microsoft or Google in Settings > Connections.',
          requiresAuth: true,
        };
      }
      actionType = 'search';
      modelUsed = models.midModel;
      activityType = 'file';
      output = workspaceSnapshot;
      {
        const workspace = output as any;
        activityLinks = {
          outlook:
            workspace?.emails?.[0]?.links?.outlook || 'https://outlook.office.com/mail/',
          gmail:
            workspace?.emails?.[0]?.links?.gmail || 'https://mail.google.com/',
          onedrive:
            workspace?.files?.[0]?.links?.onedrive || 'https://onedrive.live.com/',
          drive:
            workspace?.files?.[0]?.links?.drive || 'https://drive.google.com/',
          teams:
            workspace?.events?.[0]?.links?.teams || 'https://teams.microsoft.com',
          calendar:
            workspace?.events?.[0]?.links?.calendar || 'https://calendar.google.com/',
        };

        if (explicitCreateRequest) {
          output = await generateStandaloneDocument({
            model: models.midModel,
            query: input.query,
            workspaceContextText,
            conversationContext,
          });
          break;
        }

        const concise = await callOpenRouterChat({
          model: models.midModel,
          temperature: 0.2,
          maxTokens: 900,
          messages: [
            {
              role: 'system',
              content: `${GROUNDED_SYSTEM_RULES}\n${executionRules}\nAnswer using only workspace context. Include working links under a "Links" section.`,
            },
            {
              role: 'user',
              content: buildContextualPrompt(
                'Use the workspace results to answer the request clearly and directly.',
              ),
            },
          ],
        });

        output = concise;

        if (
          !hasWorkspaceData &&
          !hasUploadedFileData &&
          (wantsWordOutput || wantsExcelOutput || wantsPowerPointOutput)
        ) {
          output = await generateStandaloneDocument({
            model: models.midModel,
            query: input.query,
            workspaceContextText,
            conversationContext,
          });
        }
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
      {
        const priorUserTopic =
          (input.history || [])
            .filter((entry) => entry[0] === 'human')
            .slice(-2, -1)
            .map((entry) => entry[1])
            .join(' ')
            .trim() || '';
        const wantsDeeperFollowUp = /\b(go deeper|deeper|expand|more detail|elaborate)\b/i.test(
          input.query,
        );
        const contextualWebQuery = conversationContext
          ? `${input.query}\n\nContext:\n${conversationContext}${
              wantsDeeperFollowUp && priorUserTopic
                ? `\n\nPrimary subject to deepen:\n${priorUserTopic}`
                : ''
            }`
          : input.query;
        const web = await searchWeb({ query: contextualWebQuery, model: models.midModel });
        webResults = (web.results || [])
          .slice(0, 10)
          .map((entry) => ({
            name: String(entry.name || '').trim(),
            url: String(entry.url || '').trim(),
            snippet: String(entry.snippet || entry.content || '').trim(),
            reason: toReason(String(entry.snippet || entry.content || ''), String(entry.name || 'this source')),
          }))
          .filter((entry) => entry.name && entry.url)
          .filter((entry) => !isLikelyStaleLink(entry.url, entry.snippet))
          .filter(
            (entry, index, arr) =>
              arr.findIndex((item) => item.url.replace(/\/+$/, '') === entry.url.replace(/\/+$/, '')) === index,
          );
        output = web.summary;
        const sourceTitles = (webResults || []).slice(0, 4).map((item) => item.name);
        webFollowUps = sourceTitles.map((title) => `Go deeper on: ${title}`);
      }
      break;
    case 'draft_email':
      actionType = 'draft';
      modelUsed = models.midModel;
      activityType = 'email';
      activityLinks = { outlook: 'https://outlook.office.com/mail/' };
      {
        const draftJson = await callOpenRouterChat({
          model: models.midModel,
          temperature: 0.1,
          maxTokens: 900,
          messages: [
            {
              role: 'system',
              content:
                `${GROUNDED_SYSTEM_RULES}\n${executionRules}\nReturn JSON only with keys: to (string[]), subject (string), body (string), contentType ("Text"|"HTML"). Never send email.`,
            },
            {
              role: 'user',
              content: buildContextualPrompt(
                'Create an Outlook draft proposal. Keep it professional and concise.',
              ),
            },
          ],
        });

        let parsedDraft: PendingDraft | null = null;
        try {
          const matched = draftJson.match(/\{[\s\S]*\}/);
          const obj = JSON.parse(matched ? matched[0] : draftJson) as PendingDraft;
          const recipientsFromModel = Array.isArray(obj.to)
            ? obj.to.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          const recipients =
            recipientsFromModel.length > 0
              ? recipientsFromModel
              : extractEmailsFromText(input.query, conversationContext, workspaceContextText);
          parsedDraft = {
            provider:
              input.microsoftAccessToken || !input.googleAccessToken
                ? 'outlook'
                : 'gmail',
            to: recipients,
            subject: String(obj.subject || '').trim() || 'Draft from Atlas',
            body: String(obj.body || '').trim() || input.query,
            contentType: obj.contentType === 'HTML' ? 'HTML' : 'Text',
          };
        } catch {
          const fallbackRecipients = extractEmailsFromText(
            input.query,
            conversationContext,
            workspaceContextText,
          );
          parsedDraft =
            fallbackRecipients.length > 0
              ? {
                  provider:
                    input.microsoftAccessToken || !input.googleAccessToken
                      ? 'outlook'
                      : 'gmail',
                  to: fallbackRecipients,
                  subject: 'Draft from Atlas',
                  body: input.query,
                  contentType: 'Text',
                }
              : null;
        }

        if (!parsedDraft || parsedDraft.to.length === 0) {
          output =
            'Draft prepared, but recipient email is missing. Ask me again with recipient address (example: draft to alex@company.com).';
          break;
        }

        pendingDraft = parsedDraft;
        output = [
          'Draft ready for review.',
          `To: ${parsedDraft.to.join(', ')}`,
          `Subject: ${parsedDraft.subject}`,
          '',
          parsedDraft.body,
          '',
          `Review and confirm to create the draft in ${parsedDraft.provider === 'gmail' ? 'Gmail' : 'Outlook'}. Atlas will not send the email.`,
        ].join('\n');
      }
      break;
    case 'generate_deck':
      actionType = 'deck';
      modelUsed = models.bigModel;
      activityType = 'deck';
      activityLinks = { powerpoint: 'https://www.office.com/launch/powerpoint' };
      output = await generateDeckOutline({
        topic: input.query,
        source: buildContextualPrompt(
          'Generate a clear presentation outline with title slide, core narrative, and next steps.',
        ),
        model: models.bigModel,
        slideCount: requestedSlideCount,
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
            content: `${GROUNDED_SYSTEM_RULES}\n${executionRules}\nAnalyze spreadsheet context and return key metrics, trends, risks, and recommended actions.`,
          },
          {
            role: 'user',
            content: buildContextualPrompt(
              'Analyze the available spreadsheet/email/file context and produce a compact executive analysis.',
            ),
          },
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

  if (wantsCalendarAutomation) {
    if (!input.microsoftAccessToken) {
      const base = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      output = `${base}\n\nCalendar automation requires Microsoft Calendar connection. Connect Microsoft in Settings > Connections and retry.`;
    } else {
      try {
        const planJson = await callOpenRouterChat({
          model: models.midModel,
          temperature: 0.1,
          maxTokens: 1400,
          messages: [
            {
              role: 'system',
              content:
                'Return JSON only. Build an events array with objects {subject,startIso,endIso,body,location}. Use ISO-8601 date-time values. If no concrete dates are provided, return an empty array.',
            },
            {
              role: 'user',
              content: buildContextualPrompt(
                'Create Outlook calendar events from the provided workspace/uploaded context.',
              ),
            },
          ],
        });

        const eventDrafts = parseCalendarEventDrafts(planJson);
        if (eventDrafts.length === 0) {
          const base = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
          output = `${base}\n\nNo calendar events were created because no concrete date/time entries could be extracted.`;
        } else {
          const created = await Promise.allSettled(
            eventDrafts.map((draft) =>
              createCalendarEvent({
                accessToken: input.microsoftAccessToken!,
                subject: draft.subject,
                startIso: draft.startIso,
                endIso: draft.endIso,
                body: draft.body,
                location: draft.location,
              }),
            ),
          );

          const createdLinks = created
            .filter(
              (
                item,
              ): item is PromiseFulfilledResult<Record<string, any>> => item.status === 'fulfilled',
            )
            .map((item) => String(item.value?.webLink || '').trim())
            .filter(Boolean);

          if (createdLinks.length > 0) {
            const base = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
            output = `${base}\n\nCreated Outlook calendar events:\n${createdLinks.join('\n')}`;
            activityLinks.calendar = createdLinks[0];
            activityLinks.outlook = createdLinks[0];
          } else {
            const errors = created
              .filter(
                (
                  item,
                ): item is PromiseRejectedResult => item.status === 'rejected',
              )
              .map((item) =>
                item.reason instanceof Error ? item.reason.message : String(item.reason || 'Unknown error'),
              );
            const base = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
            output = `${base}\n\nCalendar event creation failed:\n${errors.join('\n')}`;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const base = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
        output = `${base}\n\nCalendar automation failed: ${message}`;
      }
    }
  }

  if (wantsWordOutput || wantsExcelOutput || wantsPowerPointOutput) {
    const stampedDate = new Date().toISOString().slice(0, 10);
    const renderedOutput = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    let artifactSources: WebResultCard[] = (webResults || []).slice(0, 8);
    if (webEnabled && artifactSources.length === 0) {
      try {
        const artifactWeb = await searchWeb({
          query: `${input.query}\n\n${conversationContext ? `Context:\n${conversationContext}` : ''}`,
          model: models.midModel,
        });
        artifactSources = (artifactWeb.results || [])
          .slice(0, 8)
          .map((entry) => ({
            name: String(entry.name || '').trim(),
            url: String(entry.url || '').trim(),
            snippet: String(entry.snippet || entry.content || '').trim(),
            reason: toReason(String(entry.snippet || entry.content || ''), String(entry.name || 'this source')),
          }))
          .filter((entry) => entry.name && entry.url)
          .filter((entry) => !isLikelyStaleLink(entry.url, entry.snippet));
        if (!webResults || webResults.length === 0) {
          webResults = artifactSources;
          webFollowUps = artifactSources.slice(0, 4).map((source) => `Go deeper on: ${source.name}`);
        }
      } catch {
        // best-effort enrichment only
      }
    }
    const sourceCardsText = toSourceCardsText(artifactSources);
    const [wordTemplate, excelTemplate, powerpointTemplate] = await Promise.all([
      wantsWordOutput ? loadActiveTemplate({ kind: 'word', userId: input.userId }) : Promise.resolve(null),
      wantsExcelOutput ? loadActiveTemplate({ kind: 'excel', userId: input.userId }) : Promise.resolve(null),
      wantsPowerPointOutput
        ? loadActiveTemplate({ kind: 'powerpoint', userId: input.userId })
        : Promise.resolve(null),
    ]);

    const [artifactWordText, artifactExcelText, artifactDeckText] = await Promise.all([
      wantsWordOutput
        ? generateArtifactContent({
            model: models.midModel,
            mode: 'word',
            query: input.query,
            currentOutput: renderedOutput,
            conversationContext,
            workspaceContextText,
            uploadedFileContextText,
            sourceCardsText,
          })
        : Promise.resolve(renderedOutput),
      wantsExcelOutput
        ? generateArtifactContent({
            model: models.midModel,
            mode: 'excel',
            query: input.query,
            currentOutput: renderedOutput,
            conversationContext,
            workspaceContextText,
            uploadedFileContextText,
            sourceCardsText,
          })
        : Promise.resolve(renderedOutput),
      wantsPowerPointOutput
        ? generateArtifactContent({
            model: models.midModel,
            mode: 'powerpoint',
            query: input.query,
            currentOutput: renderedOutput,
            conversationContext,
            workspaceContextText,
            uploadedFileContextText,
            sourceCardsText,
          })
        : Promise.resolve(renderedOutput),
    ]);
    const exportedLinks: string[] = [];
    const exportErrors: string[] = [];
    const hasMicrosoftToken = Boolean(input.microsoftAccessToken);
    const hasGoogleToken = Boolean(input.googleAccessToken);
    const sourcesSection =
      artifactSources.length > 0
        ? `\n\nSources:\n${artifactSources
            .slice(0, 8)
            .map((source, index) => `${index + 1}. ${source.name} - ${source.url}`)
            .join('\n')}`
        : '';

    if (wantsWordOutput) {
      const wordFileName = `Atlas-Document-${stampedDate}.doc`;
      const finalWordText = `${artifactWordText}${sourcesSection}`.trim();
      const wordTitle = extractRequestedTitle(input.query, 'Atlas Document');
      const templateValues = toTemplateValues({
        title: wordTitle,
        content: finalWordText,
        sourcesSection,
      });
      const wordContent =
        wordTemplate?.mime_type?.includes('text/html')
          ? renderTemplate(wordTemplate.template_content, templateValues)
          : toWordHtml(finalWordText, wordTitle);
      let cloudCreated = false;

      if (hasMicrosoftToken) {
        try {
          const doc = await createDriveFile({
            accessToken: input.microsoftAccessToken!,
            fileName: wordFileName,
            content: wordContent,
            contentType: 'text/html; charset=utf-8',
          });
          if (doc.webUrl) {
            cloudCreated = true;
            exportedLinks.push(`Word: ${doc.webUrl}`);
            activityLinks.word = doc.webUrl;
            activityLinks.onedrive = doc.webUrl;
            downloads.push({
              kind: 'word',
              fileName: wordFileName,
              mimeType: 'text/html; charset=utf-8',
              webUrl: doc.webUrl,
              driveItemId: String(doc.id || '').trim() || undefined,
              origin: 'microsoft',
              previewText: finalWordText,
            });
            if (wordTemplate) {
              exportedLinks.push(`Word template: ${wordTemplate.name}`);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          exportErrors.push(`Word export failed: ${message}`);
        }
      } else if (hasGoogleToken) {
        try {
          const doc = await createGoogleDocFromText({
            accessToken: input.googleAccessToken!,
            title: `Atlas Document ${stampedDate}`,
            text: finalWordText,
          });
          cloudCreated = true;
          exportedLinks.push(`Google Docs: ${doc.webUrl}`);
          activityLinks.word = doc.webUrl;
          activityLinks.drive = doc.webUrl;
          downloads.push({
            kind: 'word',
            fileName: wordFileName,
            mimeType: 'application/vnd.google-apps.document',
            webUrl: doc.webUrl,
            origin: 'google',
            previewText: finalWordText,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          exportErrors.push(`Google Docs export failed: ${message}`);
        }
      }

      if (!cloudCreated) {
        downloads.push({
          kind: 'word',
          fileName: wordFileName,
          mimeType: 'text/html; charset=utf-8',
          contentBase64: toBase64(wordContent),
          origin: 'local',
          previewText: finalWordText,
        });
        exportedLinks.push(`Word (download): ${wordFileName}`);
      }
    }

    if (wantsExcelOutput) {
      const excelFileName = `Atlas-Spreadsheet-${stampedDate}.xlsx`;
      const workbookTitle = extractRequestedTitle(input.query, 'Astro Sheet');
      const baseExcelText = `${artifactExcelText}${sourcesSection}`.trim();
      const finalExcelText = excelTemplate
        ? renderTemplate(
            excelTemplate.template_content,
            toTemplateValues({
              title: workbookTitle,
              content: baseExcelText,
              sourcesSection,
            }),
          )
        : baseExcelText;
      const workbookBuffer = createWorkbookFromText({
        text: finalExcelText,
        title: workbookTitle,
      });
      const workbookPreviewText = extractWorkbookText(workbookBuffer).slice(0, 8000);
      let cloudCreated = false;

      if (hasMicrosoftToken) {
        try {
          const workbook = await createDriveFile({
            accessToken: input.microsoftAccessToken!,
            fileName: excelFileName,
            content: workbookBuffer,
            contentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
          if (workbook.webUrl) {
            cloudCreated = true;
            exportedLinks.push(`Excel: ${workbook.webUrl}`);
            activityLinks.excel = workbook.webUrl;
            activityLinks.onedrive = activityLinks.onedrive || workbook.webUrl;
            downloads.push({
              kind: 'excel',
              fileName: excelFileName,
              mimeType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              webUrl: workbook.webUrl,
              driveItemId: String(workbook.id || '').trim() || undefined,
              origin: 'microsoft',
              previewText: workbookPreviewText,
            });
            if (excelTemplate) {
              exportedLinks.push(`Excel template: ${excelTemplate.name}`);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          exportErrors.push(`Excel export failed: ${message}`);
        }
      } else if (hasGoogleToken) {
        try {
          const sheet = await createGoogleSheetFromText({
            accessToken: input.googleAccessToken!,
            title: `Atlas Spreadsheet ${stampedDate}`,
            text: finalExcelText,
          });
          cloudCreated = true;
          exportedLinks.push(`Google Sheets: ${sheet.webUrl}`);
          activityLinks.excel = sheet.webUrl;
          activityLinks.drive = activityLinks.drive || sheet.webUrl;
          downloads.push({
            kind: 'excel',
            fileName: excelFileName,
            mimeType: 'application/vnd.google-apps.spreadsheet',
            webUrl: sheet.webUrl,
            origin: 'google',
            previewText: workbookPreviewText,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          exportErrors.push(`Google Sheets export failed: ${message}`);
        }
      }

      if (!cloudCreated) {
        downloads.push({
          kind: 'excel',
          fileName: excelFileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          contentBase64: workbookBuffer.toString('base64'),
          origin: 'local',
          previewText: workbookPreviewText,
        });
        exportedLinks.push(`Excel (download): ${excelFileName}`);
      }
    }

    if (wantsPowerPointOutput) {
      const pptFileName = `Atlas-Deck-${stampedDate}.pptx`;
      const deckTitle = cleanDeckTitle(input.query);
      const baseDeckText = `${artifactDeckText}${sourcesSection}`.trim();
      const finalDeckText = powerpointTemplate
        ? renderTemplate(
            powerpointTemplate.template_content,
            toTemplateValues({
              title: deckTitle,
              content: baseDeckText,
              sourcesSection,
            }),
          )
        : baseDeckText;
      const pptBuffer = await createPresentationFromText({
        title: deckTitle,
        text: finalDeckText,
        slideCount: requestedSlideCount,
      });
      let cloudCreated = false;

      if (hasMicrosoftToken) {
        try {
          const deck =
            wantsDeckUpdate && latestPowerPointArtifact?.driveItemId
              ? await updateDriveFileContent({
                  accessToken: input.microsoftAccessToken!,
                  itemId: latestPowerPointArtifact.driveItemId,
                  content: pptBuffer,
                  contentType:
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                })
              : await createDriveFile({
                  accessToken: input.microsoftAccessToken!,
                  fileName: pptFileName,
                  content: pptBuffer,
                  contentType:
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                });
          if (deck.webUrl) {
            cloudCreated = true;
            exportedLinks.push(
              `${wantsDeckUpdate ? 'PowerPoint (updated)' : 'PowerPoint'}: ${deck.webUrl}`,
            );
            activityLinks.powerpoint = deck.webUrl;
            activityLinks.onedrive = activityLinks.onedrive || deck.webUrl;
            downloads.push({
              kind: 'powerpoint',
              fileName:
                String(deck.name || '').trim() ||
                latestPowerPointArtifact?.fileName ||
                pptFileName,
              mimeType:
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              webUrl: deck.webUrl,
              driveItemId: String(deck.id || '').trim() || latestPowerPointArtifact?.driveItemId,
              origin: 'microsoft',
              previewText: finalDeckText,
            });
            if (powerpointTemplate) {
              exportedLinks.push(`PowerPoint template: ${powerpointTemplate.name}`);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          exportErrors.push(`PowerPoint export failed: ${message}`);
        }
      } else if (hasGoogleToken) {
        try {
          const deck = await createGoogleSlidesFromText({
            accessToken: input.googleAccessToken!,
            title: `Atlas Deck ${stampedDate}`,
            text: finalDeckText,
          });
          cloudCreated = true;
          exportedLinks.push(`Google Slides: ${deck.webUrl}`);
          activityLinks.powerpoint = deck.webUrl;
          activityLinks.drive = activityLinks.drive || deck.webUrl;
          downloads.push({
            kind: 'powerpoint',
            fileName: pptFileName,
            mimeType: 'application/vnd.google-apps.presentation',
            webUrl: deck.webUrl,
            origin: 'google',
            previewText: finalDeckText,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          exportErrors.push(`Google Slides export failed: ${message}`);
        }
      }

      if (!cloudCreated) {
        downloads.push({
          kind: 'powerpoint',
          fileName: pptFileName,
          mimeType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          contentBase64: pptBuffer.toString('base64'),
          origin: 'local',
          previewText: finalDeckText,
        });
        exportedLinks.push(`PowerPoint (download): ${pptFileName}`);
      }
    }

    if (exportedLinks.length > 0) {
      output = `${renderedOutput}\n\nCreated files:\n${exportedLinks.join('\n')}`;
    } else if (exportErrors.length > 0) {
      output = `${renderedOutput}\n\nFile export was requested but failed:\n${exportErrors.join('\n')}`;
    }
  }

  const cleanedOutput =
    typeof output === 'string' ? stripInternalArtifacts(output) : output;

  await Promise.all([
    recordAIUsage({
      userId: input.userId,
      actionType,
      modelUsed,
    }),
    createActivityItem({
      userId: input.userId,
      type: activityType,
      sourceId: input.chatId || crypto.randomUUID(),
      title: input.query.slice(0, 120),
      summary:
        typeof cleanedOutput === 'string'
          ? cleanedOutput
          : JSON.stringify(cleanedOutput),
      links: activityLinks,
      modelUsed,
    }),
  ]);

  return {
    intent: effectiveIntent,
    output: cleanedOutput,
    modelUsed,
    downloads,
    pendingDraft,
    webResults,
    webFollowUps,
    usage: {
      tier: usage.tier,
      used: usage.used + 1,
      limit: usage.limit,
      remaining: usage.limit === null ? null : Math.max(0, usage.limit - (usage.used + 1)),
    },
  };
};

