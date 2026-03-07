const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

const graphRequest = async <T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft Graph request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
};

export const getMicrosoftAuthUrl = (state?: string): string => {
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ||
    `${process.env.APP_URL || 'http://localhost:3000'}/microsoft/callback`;

  if (!clientId || !redirectUri) {
    throw new Error('Missing Microsoft OAuth env vars');
  }

  const scope = [
    'openid',
    'profile',
    'offline_access',
    'User.Read',
    'Mail.Read',
    'Mail.Send',
    'Calendars.Read',
    'Files.Read',
    'Sites.Read.All',
    'OnlineMeetings.Read',
    'CallRecords.Read.All',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope,
    state: state || crypto.randomUUID(),
  });

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
};

export const exchangeMicrosoftCode = async (code: string) => {
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ||
    `${process.env.APP_URL || 'http://localhost:3000'}/microsoft/callback`;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Microsoft OAuth env vars');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to exchange Microsoft auth code (${response.status}): ${text}`);
  }

  return response.json();
};

export const listEmails = async (accessToken: string, top = 10) =>
  graphRequest<{ value: Array<Record<string, any>> }>(
    `/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,receivedDateTime,webLink,from`,
    accessToken,
  );

export const getEmailById = async (accessToken: string, id: string) =>
  graphRequest<Record<string, any>>(`/me/messages/${id}`, accessToken);

export const listEvents = async (accessToken: string, top = 10) =>
  graphRequest<{ value: Array<Record<string, any>> }>(
    `/me/events?$top=${top}&$orderby=start/dateTime&$select=id,subject,webLink,start,end,onlineMeetingUrl`,
    accessToken,
  );

export const listDriveRootChildren = async (accessToken: string, top = 25) =>
  graphRequest<{ value: Array<Record<string, any>> }>(
    `/me/drive/root/children?$top=${top}&$select=id,name,webUrl,lastModifiedDateTime,file,folder`,
    accessToken,
  );

export const getDriveItemContent = async (accessToken: string, id: string) => {
  const response = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${id}/content`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load drive item content (${response.status}): ${text}`);
  }

  return response.text();
};

export const listOnlineMeetings = async (accessToken: string, top = 10) =>
  graphRequest<{ value: Array<Record<string, any>> }>(
    `/me/onlineMeetings?$top=${top}`,
    accessToken,
  );

export const getCurrentUser = async (accessToken: string) =>
  graphRequest<Record<string, any>>('/me?$select=id,displayName,userPrincipalName,mail', accessToken);

export const getCallRecordSessions = async (accessToken: string, id: string) =>
  graphRequest<{ value: Array<Record<string, any>> }>(
    `/communications/callRecords/${id}/sessions`,
    accessToken,
  );

export const getCallRecord = async (accessToken: string, id: string) =>
  graphRequest<Record<string, any>>(`/communications/callRecords/${id}`, accessToken);

type TranscriptSegment = {
  speaker: string;
  text: string;
  timestamp?: string;
};

export const normalizeTranscriptSegments = (
  sessions: Array<Record<string, any>>,
): TranscriptSegment[] => {
  const segments: TranscriptSegment[] = [];

  sessions.forEach((session) => {
    const transcriptItems = session?.segments || session?.transcript || [];
    if (!Array.isArray(transcriptItems)) {
      return;
    }

    transcriptItems.forEach((item: any) => {
      const text = item?.text || item?.content || '';
      if (!text || typeof text !== 'string') return;

      segments.push({
        speaker: item?.speaker?.displayName || item?.speaker || 'Unknown Speaker',
        text: text.trim(),
        timestamp: item?.startDateTime || item?.timestamp || undefined,
      });
    });
  });

  return segments;
};

export const mergeTranscriptText = (segments: TranscriptSegment[]) =>
  segments
    .map((segment) => {
      const prefix = segment.timestamp
        ? `[${segment.timestamp}] ${segment.speaker}: `
        : `${segment.speaker}: `;
      return `${prefix}${segment.text}`;
    })
    .join('\n');

export const searchWorkspace = async (accessToken: string, query: string) => {
  const [emails, files, events] = await Promise.all([
    listEmails(accessToken, 5),
    listDriveRootChildren(accessToken, 10),
    listEvents(accessToken, 5),
  ]);

  const norm = query.toLowerCase();

  const filteredEmails = emails.value.filter((item) =>
    `${item.subject || ''} ${item.bodyPreview || ''}`.toLowerCase().includes(norm),
  );

  const filteredFiles = files.value.filter((item) =>
    `${item.name || ''}`.toLowerCase().includes(norm),
  );

  const filteredEvents = events.value.filter((item) =>
    `${item.subject || ''}`.toLowerCase().includes(norm),
  );

  return {
    emails: filteredEmails.map((item) => ({
      ...item,
      links: {
        outlook: item.webLink || '',
      },
    })),
    files: filteredFiles.map((item) => ({
      ...item,
      links: {
        onedrive: item.webUrl || '',
        word: item.webUrl || '',
        excel: item.webUrl || '',
        powerpoint: item.webUrl || '',
      },
    })),
    events: filteredEvents.map((item) => ({
      ...item,
      links: {
        outlook: item.webLink || '',
        teams: item.onlineMeetingUrl || '',
      },
    })),
  };
};
