import type { GoogleAppKey } from '@/lib/googleScopes';
import { resolveScopesForGoogleApp } from '@/lib/googleScopes';

const normalizeAppBaseUrl = (value?: string) =>
  (value || 'http://localhost:3000').trim().replace(/\/+$/, '');

const resolveGoogleRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI?.trim() || `${normalizeAppBaseUrl(process.env.APP_URL)}/google/callback`;

export const getGoogleAuthUrl = (input?: {
  state?: string;
  app?: GoogleAppKey;
}): string => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = resolveGoogleRedirectUri();
  if (!clientId) {
    throw new Error('Missing GOOGLE_CLIENT_ID');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: resolveScopesForGoogleApp(input?.app).join(' '),
    state: input?.state || crypto.randomUUID(),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const exchangeGoogleCode = async (input: { code: string; app?: GoogleAppKey }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = resolveGoogleRedirectUri();
  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth env vars');
  }

  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to exchange Google auth code (${res.status}): ${text}`);
  }

  return res.json();
};

export const refreshGoogleToken = async (input: { refreshToken: string; app?: GoogleAppKey }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth env vars');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh Google token (${res.status}): ${text}`);
  }

  return res.json();
};

export const getGoogleCurrentUser = async (accessToken: string) => {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Google profile (${res.status}): ${text}`);
  }

  return res.json();
};

const googleRequest = async <T>(url: string, accessToken: string): Promise<T> => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
};

type GoogleWorkspaceSnapshot = {
  emails: Array<Record<string, any>>;
  files: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
};

export const searchGoogleWorkspace = async (
  accessToken: string,
  query: string,
): Promise<GoogleWorkspaceSnapshot> => {
  const q = query.trim();
  const encoded = encodeURIComponent(q);

  const [gmailRes, driveRes, calendarRes] = await Promise.allSettled([
    googleRequest<any>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encoded}&maxResults=8`,
      accessToken,
    ),
    googleRequest<any>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `fullText contains '${q.replace(/'/g, "\\'")}' and trashed=false`,
      )}&pageSize=10&fields=files(id,name,mimeType,webViewLink,modifiedTime)`,
      accessToken,
    ),
    googleRequest<any>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=8&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
        new Date().toISOString(),
      )}&q=${encoded}`,
      accessToken,
    ),
  ]);

  const messages =
    gmailRes.status === 'fulfilled' ? (gmailRes.value?.messages || []).slice(0, 6) : [];

  const emailDetails = await Promise.all(
    messages.map(async (item: any) => {
      try {
        const detail = await googleRequest<any>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          accessToken,
        );
        const headers = detail?.payload?.headers || [];
        const from = headers.find((h: any) => h.name === 'From')?.value || '';
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
        return {
          id: item.id,
          subject,
          bodyPreview: detail?.snippet || '',
          from: { emailAddress: { name: from, address: from } },
          links: {
            gmail: `https://mail.google.com/mail/u/0/#inbox/${item.id}`,
          },
        };
      } catch {
        return null;
      }
    }),
  );

  const files =
    driveRes.status === 'fulfilled'
      ? (driveRes.value?.files || []).slice(0, 8).map((file: any) => ({
          id: file.id,
          name: file.name,
          webUrl: file.webViewLink || '',
          summary: '',
          links: {
            drive: file.webViewLink || '',
            docs: file.webViewLink || '',
            sheets: file.webViewLink || '',
            slides: file.webViewLink || '',
          },
        }))
      : [];

  const events =
    calendarRes.status === 'fulfilled'
      ? (calendarRes.value?.items || []).slice(0, 8).map((event: any) => ({
          id: event.id,
          subject: event.summary || '(No title)',
          start: event.start || {},
          end: event.end || {},
          links: {
            calendar: event.htmlLink || '',
            meet: event.hangoutLink || '',
          },
        }))
      : [];

  return {
    emails: emailDetails.filter(Boolean) as Array<Record<string, any>>,
    files,
    events,
  };
};

const trimText = (value: string, max = 50000) => (value.length > max ? value.slice(0, max) : value);

export const createGoogleGmailDraft = async (input: {
  accessToken: string;
  to: string[];
  subject: string;
  body: string;
  contentType?: 'Text' | 'HTML';
}) => {
  const contentType = input.contentType === 'HTML' ? 'text/html' : 'text/plain';
  const rawMessage = [
    `To: ${input.to.join(', ')}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}; charset="UTF-8"`,
    '',
    input.body,
  ].join('\r\n');

  const raw = Buffer.from(rawMessage, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Gmail draft (${res.status}): ${text}`);
  }

  const draft = await res.json();
  const draftId = draft?.id || draft?.message?.id || '';
  return {
    id: draftId,
    webLink: draftId ? `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}` : 'https://mail.google.com/mail/u/0/#drafts',
  };
};

export const createGoogleDocFromText = async (input: {
  accessToken: string;
  title: string;
  text: string;
}) => {
  const res = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: input.title }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Google Doc (${res.status}): ${text}`);
  }
  const created = (await res.json()) as { documentId: string };

  const documentId = created.documentId;
  const update = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: trimText(input.text, 80000),
            },
          },
        ],
      }),
      cache: 'no-store',
    },
  );
  if (!update.ok) {
    const text = await update.text();
    throw new Error(`Failed to write Google Doc content (${update.status}): ${text}`);
  }

  return {
    documentId,
    webUrl: `https://docs.google.com/document/d/${documentId}/edit`,
  };
};

export const createGoogleSheetFromText = async (input: {
  accessToken: string;
  title: string;
  text: string;
}) => {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: input.title },
    }),
    cache: 'no-store',
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create Google Sheet (${createRes.status}): ${text}`);
  }
  const created = (await createRes.json()) as { spreadsheetId: string };

  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200);
  const values = [['Section', 'Details'], ...lines.map((line, i) => [`Row ${i + 1}`, line])];
  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values/A1:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
      cache: 'no-store',
    },
  );
  if (!valuesRes.ok) {
    const text = await valuesRes.text();
    throw new Error(`Failed to populate Google Sheet (${valuesRes.status}): ${text}`);
  }

  return {
    spreadsheetId: created.spreadsheetId,
    webUrl: `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
  };
};

export const createGoogleSlidesFromText = async (input: {
  accessToken: string;
  title: string;
  text: string;
}) => {
  const createRes = await fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: input.title }),
    cache: 'no-store',
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create Google Slides presentation (${createRes.status}): ${text}`);
  }
  const created = (await createRes.json()) as { presentationId: string };

  const bullets = input.text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 30);
  const body = bullets.join('\n');

  const updateRes = await fetch(
    `https://slides.googleapis.com/v1/presentations/${created.presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            createSlide: {
              objectId: 'atlas_slide_1',
              slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
              placeholderIdMappings: [
                {
                  layoutPlaceholder: { type: 'TITLE', index: 0 },
                  objectId: 'atlas_title_1',
                },
                {
                  layoutPlaceholder: { type: 'BODY', index: 0 },
                  objectId: 'atlas_body_1',
                },
              ],
            },
          },
          {
            insertText: {
              objectId: 'atlas_title_1',
              insertionIndex: 0,
              text: trimText(input.title, 200),
            },
          },
          {
            insertText: {
              objectId: 'atlas_body_1',
              insertionIndex: 0,
              text: trimText(body || input.text, 10000),
            },
          },
        ],
      }),
      cache: 'no-store',
    },
  );
  if (!updateRes.ok) {
    const text = await updateRes.text();
    throw new Error(`Failed to populate Google Slides presentation (${updateRes.status}): ${text}`);
  }

  return {
    presentationId: created.presentationId,
    webUrl: `https://docs.google.com/presentation/d/${created.presentationId}/edit`,
  };
};
