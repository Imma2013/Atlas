import type { MCPServer } from '@/lib/router';
import type { BrainIntent } from '@/lib/router';

export type LoadedMcpServer = {
  serverId: string;
  displayName: string;
  source: 'official' | 'custom';
  mode: 'read_only' | 'read_draft';
  tools: string[];
  blockedTools: string[];
};

const OUTLOOK_MAIL_TOOLS = {
  serverId: 'mcp_MailTools',
  displayName: 'Work IQ Mail',
  allTools: [
    'mcp_MailTools_graph_mail_createMessage',
    'mcp_MailTools_graph_mail_deleteMessage',
    'mcp_MailTools_graph_mail_getMessage',
    'mcp_MailTools_graph_mail_listSent',
    'mcp_MailTools_graph_mail_reply',
    'mcp_MailTools_graph_mail_replyAll',
    'mcp_MailTools_graph_mail_searchMessages',
    'mcp_MailTools_graph_mail_sendDraft',
    'mcp_MailTools_graph_mail_sendMail',
    'mcp_MailTools_graph_mail_updateMessage',
  ],
  allowInReadDraftMode: [
    'mcp_MailTools_graph_mail_createMessage',
    'mcp_MailTools_graph_mail_deleteMessage',
    'mcp_MailTools_graph_mail_getMessage',
    'mcp_MailTools_graph_mail_listSent',
    'mcp_MailTools_graph_mail_searchMessages',
    'mcp_MailTools_graph_mail_updateMessage',
  ],
};

const BASIC_SERVER_TOOLS: Record<Exclude<MCPServer, 'Outlook'>, string[]> = {
  Word: [
    'WordCreateNewDocument',
    'WordGetDocumentContent',
    'WordCreateNewComment',
    'WordReplyToComment',
  ],
  Excel: [
    'excel_workbook_create_from_template',
    'excel_workbook_update_range',
  ],
  PowerPoint: [
    'powerpoint_presentation_create_from_outline',
    'powerpoint_presentation_update_slides',
  ],
  OneDrive: [
    'createSmallTextFile',
    'getFolderChildren',
    'getFileOrFolderMetadata',
    'getFileOrFolderMetadataByUrl',
  ],
  Teams: [
    'mcp_graph_chat_listChats',
    'mcp_graph_chat_listChatMessages',
    'mcp_graph_teams_listTeams',
    'mcp_graph_teams_listChannels',
  ],
  Calendar: [
    'mcp_CalendarTools_graph_listEvents',
    'mcp_CalendarTools_graph_listCalendarView',
    'mcp_CalendarTools_graph_getSchedule',
    'mcp_CalendarTools_graph_findMeetingTimes',
  ],
  SharePoint: [
    'getDefaultDocumentLibraryInSite',
    'searchSharePointItems',
    'getFolderChildren',
    'getFileOrFolderMetadataByUrl',
    'shareFileOrFolder',
  ],
};

const OFFICIAL_SERVER_IDS: Partial<Record<MCPServer, string>> = {
  Outlook: 'mcp_MailTools',
  Calendar: 'mcp_CalendarTools',
  Teams: 'mcp_TeamsServer',
  Word: 'mcp_WordServer',
  OneDrive: 'mcp_ODSPRemoteServer',
  SharePoint: 'mcp_ODSPRemoteServer',
};

const OFFICIAL_DISPLAY_NAMES: Partial<Record<MCPServer, string>> = {
  Outlook: 'Work IQ Mail',
  Calendar: 'Work IQ Calendar',
  Teams: 'Work IQ Teams',
  Word: 'Work IQ Word',
  OneDrive: 'SharePoint and OneDrive',
  SharePoint: 'SharePoint and OneDrive',
};

export const loadMcpServersForRoute = (servers: MCPServer[]): LoadedMcpServer[] => {
  const loaded: LoadedMcpServer[] = [];

  for (const server of servers) {
    if (server === 'Outlook') {
      const allowed = OUTLOOK_MAIL_TOOLS.allowInReadDraftMode;
      const blocked = OUTLOOK_MAIL_TOOLS.allTools.filter((tool) => !allowed.includes(tool));
      loaded.push({
        serverId: OUTLOOK_MAIL_TOOLS.serverId,
        displayName: OUTLOOK_MAIL_TOOLS.displayName,
        source: 'official',
        mode: 'read_draft',
        tools: allowed,
        blockedTools: blocked,
      });
      continue;
    }

    if (server === 'Excel' || server === 'PowerPoint') {
      const envServerId =
        server === 'Excel'
          ? process.env.ATLAS_EXCEL_MCP_SERVER_ID
          : process.env.ATLAS_POWERPOINT_MCP_SERVER_ID;
      const resolvedServerId =
        envServerId || (server === 'Excel' ? 'mcp_ExcelServer' : 'mcp_PowerPointServer');
      loaded.push({
        serverId: resolvedServerId,
        displayName: `${server} Logic Apps MCP`,
        source: 'custom',
        mode: 'read_draft',
        tools: BASIC_SERVER_TOOLS[server] || [],
        blockedTools: [],
      });
      continue;
    }

    loaded.push({
      serverId: OFFICIAL_SERVER_IDS[server] || `mcp_${server}Tools`,
      displayName: OFFICIAL_DISPLAY_NAMES[server] || `${server} Tools`,
      source: 'official',
      mode: 'read_only',
      tools: BASIC_SERVER_TOOLS[server] || [],
      blockedTools: [],
    });
  }

  return loaded;
};

export const toCompressedToolCards = (loaded: LoadedMcpServer[]): string[] =>
  loaded.flatMap((server) =>
    server.tools.map((toolName) => `Tool: ${toolName} | Server: ${server.serverId}`),
  );

const TOOL_SELECTION_BY_INTENT: Partial<Record<BrainIntent, Partial<Record<MCPServer, string[]>>>> = {
  draft_email: {
    Outlook: [
      'mcp_MailTools_graph_mail_searchMessages',
      'mcp_MailTools_graph_mail_getMessage',
      'mcp_MailTools_graph_mail_createMessage',
    ],
  },
  summarize_email: {
    Outlook: [
      'mcp_MailTools_graph_mail_searchMessages',
      'mcp_MailTools_graph_mail_getMessage',
    ],
  },
  summarize_meeting: {
    Teams: ['mcp_graph_chat_listChats', 'mcp_graph_chat_listChatMessages'],
    Calendar: [
      'mcp_CalendarTools_graph_listCalendarView',
      'mcp_CalendarTools_graph_getEvent',
    ],
  },
  summarize_file: {
    Word: ['WordGetDocumentContent'],
    OneDrive: ['getFileOrFolderMetadataByUrl', 'getFileOrFolderMetadata'],
    SharePoint: ['searchSharePointItems', 'getFileOrFolderMetadataByUrl'],
  },
  analyze_spreadsheet: {
    Excel: ['excel_workbook_read_range', 'excel_workbook_update_range'],
  },
  generate_deck: {
    PowerPoint: ['powerpoint_presentation_create_from_outline', 'powerpoint_presentation_update_slides'],
  },
  search_workspace: {
    Outlook: ['mcp_MailTools_graph_mail_searchMessages'],
    OneDrive: ['getFolderChildren', 'getFileOrFolderMetadata'],
    Teams: ['mcp_graph_chat_listChats'],
    Calendar: ['mcp_CalendarTools_graph_listEvents'],
    SharePoint: ['searchSharePointItems'],
  },
};

const fallBackToolSlice = (server: LoadedMcpServer, max = 3) =>
  server.tools.slice(0, Math.max(1, max));

export const selectToolsForPrompt = (input: {
  intent: BrainIntent;
  query: string;
  loaded: LoadedMcpServer[];
}): LoadedMcpServer[] => {
  const q = input.query.toLowerCase();
  const intentMap = TOOL_SELECTION_BY_INTENT[input.intent] || {};

  return input.loaded.map((server) => {
    const serverName = server.displayName.toLowerCase();
    const inferredMcpServer = (
      serverName.includes('mail')
        ? 'Outlook'
        : serverName.includes('calendar')
          ? 'Calendar'
          : serverName.includes('teams')
            ? 'Teams'
            : serverName.includes('word')
              ? 'Word'
              : serverName.includes('sharepoint')
                ? 'SharePoint'
                : serverName.includes('onedrive')
                  ? 'OneDrive'
                  : serverName.includes('excel')
                    ? 'Excel'
                    : serverName.includes('powerpoint')
                      ? 'PowerPoint'
                      : null
    ) as MCPServer | null;

    const preferred =
      inferredMcpServer && intentMap[inferredMcpServer]
        ? (intentMap[inferredMcpServer] as string[])
        : [];

    let selected = preferred.filter((tool) => server.tools.includes(tool));

    // Query-aware fallback for "create" operations.
    if (selected.length === 0 && /\b(create|make|build|generate)\b/.test(q)) {
      selected = server.tools.filter(
        (tool) =>
          tool.toLowerCase().includes('create') ||
          tool.toLowerCase().includes('update'),
      );
    }

    if (selected.length === 0) {
      selected = fallBackToolSlice(server, 3);
    }

    return {
      ...server,
      tools: selected.slice(0, 3),
    };
  });
};

const GOOGLE_SERVERS: Array<LoadedMcpServer> = [
  {
    serverId: 'gws_Gmail',
    displayName: 'Google Workspace Gmail',
    source: 'official',
    mode: 'read_draft',
    tools: [
      'google_gmail_search_messages',
      'google_gmail_get_message',
      'google_gmail_create_draft',
    ],
    blockedTools: ['google_gmail_send_message'],
  },
  {
    serverId: 'gws_Drive',
    displayName: 'Google Workspace Drive',
    source: 'official',
    mode: 'read_draft',
    tools: ['google_drive_search_files', 'google_drive_get_file', 'google_drive_create_file'],
    blockedTools: [],
  },
  {
    serverId: 'gws_Docs',
    displayName: 'Google Workspace Docs',
    source: 'official',
    mode: 'read_draft',
    tools: ['google_docs_create_document', 'google_docs_update_document'],
    blockedTools: [],
  },
  {
    serverId: 'gws_Sheets',
    displayName: 'Google Workspace Sheets',
    source: 'official',
    mode: 'read_draft',
    tools: ['google_sheets_create_spreadsheet', 'google_sheets_read_range', 'google_sheets_write_range'],
    blockedTools: [],
  },
  {
    serverId: 'gws_Slides',
    displayName: 'Google Workspace Slides',
    source: 'official',
    mode: 'read_draft',
    tools: ['google_slides_create_presentation', 'google_slides_update_slides'],
    blockedTools: [],
  },
  {
    serverId: 'gws_Calendar',
    displayName: 'Google Workspace Calendar',
    source: 'official',
    mode: 'read_only',
    tools: ['google_calendar_list_events', 'google_calendar_get_event'],
    blockedTools: [],
  },
];

export const loadGoogleServersForPrompt = (input: {
  enabled: boolean;
  intent: BrainIntent;
  query: string;
}): LoadedMcpServer[] => {
  if (!input.enabled) return [];

  const q = input.query.toLowerCase();
  const pick = (id: string) => GOOGLE_SERVERS.find((s) => s.serverId === id)!;

  switch (input.intent) {
    case 'draft_email':
    case 'summarize_email':
      return [pick('gws_Gmail')];
    case 'generate_deck':
      return [pick('gws_Slides'), pick('gws_Drive')];
    case 'analyze_spreadsheet':
      return [pick('gws_Sheets'), pick('gws_Drive')];
    case 'summarize_file':
      return [pick('gws_Drive'), pick('gws_Docs')];
    case 'summarize_meeting':
      return [pick('gws_Calendar')];
    case 'search_workspace':
      return [pick('gws_Gmail'), pick('gws_Drive'), pick('gws_Calendar')];
    default:
      break;
  }

  const keywordMatches: LoadedMcpServer[] = [];
  if (/\bgmail|email|inbox\b/.test(q)) keywordMatches.push(pick('gws_Gmail'));
  if (/\bdrive|file|docs?|sheets?|slides?\b/.test(q)) keywordMatches.push(pick('gws_Drive'));
  if (/\bdoc|document\b/.test(q)) keywordMatches.push(pick('gws_Docs'));
  if (/\bsheet|spreadsheet|excel|csv\b/.test(q)) keywordMatches.push(pick('gws_Sheets'));
  if (/\bslide|presentation|deck|powerpoint\b/.test(q)) keywordMatches.push(pick('gws_Slides'));
  if (/\bcalendar|event|schedule|meeting\b/.test(q)) keywordMatches.push(pick('gws_Calendar'));

  if (keywordMatches.length > 0) {
    return Array.from(new Map(keywordMatches.map((s) => [s.serverId, s])).values()).slice(0, 3);
  }

  return [pick('gws_Gmail'), pick('gws_Drive')];
};

export const enforceToolCardLimit = (
  servers: LoadedMcpServer[],
  maxCards: number,
): LoadedMcpServer[] => {
  const limit = Math.max(1, Math.floor(maxCards || 1));
  let used = 0;
  const trimmed: LoadedMcpServer[] = [];

  for (const server of servers) {
    if (used >= limit) break;
    const remaining = limit - used;
    const tools = server.tools.slice(0, remaining);
    if (tools.length === 0) continue;
    trimmed.push({
      ...server,
      tools,
    });
    used += tools.length;
  }

  return trimmed;
};
