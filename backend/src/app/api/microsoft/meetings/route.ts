import { getCallRecordSessions, listOnlineMeetings } from '@/lib/microsoft';

export const runtime = 'nodejs';

const getAccessToken = (req: Request) =>
  req.headers.get('x-microsoft-access-token') ||
  req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

export const GET = async (req: Request) => {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return Response.json({ message: 'Missing Microsoft access token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const callRecordId = searchParams.get('callRecordId');

    if (callRecordId) {
      const sessions = await getCallRecordSessions(accessToken, callRecordId);
      return Response.json({ sessions }, { status: 200 });
    }

    const meetings = await listOnlineMeetings(accessToken, 10);
    return Response.json({ meetings: meetings.value }, { status: 200 });
  } catch (error: any) {
    const message = String(error?.message || '');
    const callRecordsPermissionError =
      message.includes('CallRecords.Read') || message.includes('Authorization_RequestDenied');
    const unauthorized =
      message.includes('(401)') || message.includes('InvalidAuthenticationToken');
    const forbidden =
      message.includes('(403)') || message.includes('Forbidden');

    if (callRecordsPermissionError || forbidden) {
      return Response.json(
        {
          meetings: [],
          warning:
            'Meetings endpoint is unavailable for this account/permission set. Other workspace features remain available.',
          error: error?.message || 'Unknown error',
        },
        { status: 200 },
      );
    }

    return Response.json(
      {
        message: unauthorized
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Apps.'
          : callRecordsPermissionError
            ? 'Call records require Microsoft Graph application permissions with admin consent. Online meetings are available with delegated user OAuth.'
            : 'Failed to fetch meetings',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};
