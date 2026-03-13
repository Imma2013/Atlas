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

export type MCPServer =
  | 'Word'
  | 'Excel'
  | 'PowerPoint'
  | 'Outlook'
  | 'OneDrive'
  | 'Teams'
  | 'Calendar'
  | 'SharePoint';

export type MCPRouterDecision = {
  required_mcp_servers: MCPServer[];
  reasoning: string;
};

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
    (hasGemini ? 'gemini/gemini-2.5-flash' : 'anthropic/claude-opus-4.6'),
  midModel:
    process.env.ATLAS_MID_MODEL ||
    process.env.OPENROUTER_MID_MODEL ||
    (hasGemini ? 'gemini/gemini-2.5-flash' : 'anthropic/claude-opus-4.6'),
  bigModel:
    process.env.ATLAS_BIG_MODEL ||
    process.env.OPENROUTER_BIG_MODEL ||
    (hasAnthropic ? 'anthropic/claude-opus-4.6' : 'gemini/gemini-2.5-pro'),
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

const ALLOWED_MCP_SERVERS: MCPServer[] = [
  'Word',
  'Excel',
  'PowerPoint',
  'Outlook',
  'OneDrive',
  'Teams',
  'Calendar',
  'SharePoint',
];

const routerPrompt = `You are a routing model.
Your ONLY job is to decide which Microsoft MCP servers are required for the user's request.

RULES:
- Do NOT generate code.
- Do NOT plan the workflow.
- Do NOT call tools.
- Do NOT hallucinate tools.
- Only choose from this list:

[Word, Excel, PowerPoint, Outlook, OneDrive, Teams, Calendar, SharePoint]

OUTPUT FORMAT (JSON ONLY):
{
  "required_mcp_servers": [...],
  "reasoning": "1 sentence explaining why"
}

If the user request is unclear, output:
{
  "required_mcp_servers": [],
  "reasoning": "unclear"
}`;

const parseRouterJson = (raw: string): Partial<MCPRouterDecision> | null => {
  const trimmed = raw.trim();
  const direct = trimmed.match(/\{[\s\S]*\}/);
  const candidate = direct ? direct[0] : trimmed;
  try {
    return JSON.parse(candidate) as Partial<MCPRouterDecision>;
  } catch {
    return null;
  }
};

const keywordMcpFallback = (query: string): MCPRouterDecision => {
  const q = query.toLowerCase();
  const selected = new Set<MCPServer>();
  const emailContext =
    q.includes('email') ||
    q.includes('outlook') ||
    q.includes('mail') ||
    q.includes('inbox') ||
    q.includes('recipient') ||
    q.includes('to:');

  if (emailContext || ((q.includes('reply') || q.includes('draft')) && emailContext)) {
    selected.add('Outlook');
  }
  if (q.includes('word') || q.includes('doc') || q.includes('document')) {
    selected.add('Word');
  }
  if (q.includes('excel') || q.includes('spreadsheet') || q.includes('csv')) {
    selected.add('Excel');
  }
  if (q.includes('powerpoint') || q.includes('slides') || q.includes('deck') || q.includes('presentation')) {
    selected.add('PowerPoint');
  }
  if (q.includes('onedrive') || q.includes('file') || q.includes('files')) {
    selected.add('OneDrive');
  }
  if (q.includes('teams') || q.includes('meeting') || q.includes('transcript')) {
    selected.add('Teams');
  }
  if (q.includes('calendar') || q.includes('event') || q.includes('schedule')) {
    selected.add('Calendar');
  }
  if (q.includes('sharepoint') || q.includes('site')) {
    selected.add('SharePoint');
  }

  return {
    required_mcp_servers: Array.from(selected),
    reasoning: selected.size > 0 ? 'Selected from user request keywords.' : 'unclear',
  };
};

const keywordFallback = (query: string): BrainIntent => {
  const q = query.toLowerCase();
  const emailContext =
    q.includes('email') ||
    q.includes('outlook') ||
    q.includes('mail') ||
    q.includes('inbox') ||
    q.includes('recipient') ||
    q.includes('to:');

  if (q.includes('meeting') || q.includes('transcript')) return 'summarize_meeting';
  if (emailContext && (q.includes('draft') || q.includes('reply') || q.includes('send'))) {
    return 'draft_email';
  }
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

export const routeMcpServers = async (
  query: string,
  model = defaultRouterModelConfig.routerModel,
): Promise<MCPRouterDecision> => {
  try {
    const raw = await callOpenRouterChat({
      model,
      temperature: 0,
      maxTokens: 180,
      messages: [
        { role: 'system', content: routerPrompt },
        { role: 'user', content: query },
      ],
    });

    const parsed = parseRouterJson(raw);
    const requested = Array.isArray(parsed?.required_mcp_servers)
      ? parsed?.required_mcp_servers
      : [];

    const valid = Array.from(
      new Set(
        requested.filter((name): name is MCPServer =>
          ALLOWED_MCP_SERVERS.includes(name as MCPServer),
        ),
      ),
    ).slice(0, 4);

    if (valid.length === 0) {
      return keywordMcpFallback(query);
    }

    return {
      required_mcp_servers: valid,
      reasoning:
        typeof parsed?.reasoning === 'string' && parsed.reasoning.trim().length > 0
          ? parsed.reasoning.trim()
          : 'Selected servers map directly to the request.',
    };
  } catch {
    return keywordMcpFallback(query);
  }
};

export const inferIntentFromMcpServers = (
  query: string,
  servers: MCPServer[],
  webEnabled: boolean,
): BrainIntent => {
  const q = query.toLowerCase();
  const has = (name: MCPServer) => servers.includes(name);
  const hasAnyMicrosoft = servers.length > 0;
  const emailContext =
    q.includes('email') ||
    q.includes('outlook') ||
    q.includes('mail') ||
    q.includes('inbox') ||
    q.includes('recipient') ||
    q.includes('to:');

  if (
    has('Outlook') &&
    emailContext &&
    (q.includes('draft') || q.includes('reply') || q.includes('send'))
  ) {
    return 'draft_email';
  }
  if (
    (has('Outlook') || q.includes('outlook')) &&
    (has('OneDrive') || q.includes('onedrive')) &&
    /(auto|automate|automation|attachment|save|sync|move)/.test(q)
  ) {
    return 'search_workspace';
  }
  if (has('PowerPoint') || q.includes('slide') || q.includes('deck') || q.includes('presentation')) {
    return 'generate_deck';
  }
  if (has('Excel') || q.includes('spreadsheet') || q.includes('excel') || q.includes('csv')) {
    return 'analyze_spreadsheet';
  }
  if ((has('Teams') || has('Calendar')) && (q.includes('meeting') || q.includes('transcript') || q.includes('calendar'))) {
    return 'summarize_meeting';
  }
  if (has('Outlook') && q.includes('email')) {
    return 'summarize_email';
  }
  if (
    has('Word') ||
    has('SharePoint') ||
    q.includes('file') ||
    q.includes('document') ||
    (has('OneDrive') && (q.includes('file') || q.includes('document') || q.includes('attachment')))
  ) {
    return 'summarize_file';
  }
  if (hasAnyMicrosoft) {
    return 'search_workspace';
  }
  const keywordIntent = keywordFallback(query);
  if (keywordIntent !== 'search_web') {
    return keywordIntent;
  }
  if (webEnabled) {
    return 'search_web';
  }
  return keywordIntent;
};

export const classifyIntent = async (
  query: string,
  model = defaultRouterModelConfig.routerModel,
): Promise<BrainIntent> => {
  try {
    const route = await routeMcpServers(query, model);
    const inferred = inferIntentFromMcpServers(query, route.required_mcp_servers, true);
    if (intentLabels.includes(inferred) && inferred !== 'unknown') {
      return inferred;
    }
    return keywordFallback(query);
  } catch {
    return keywordFallback(query);
  }
};
