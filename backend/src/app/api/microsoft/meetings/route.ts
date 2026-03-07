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
    return Response.json(
      { message: 'Failed to fetch meetings', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};