import { getEmailById, listEmails } from '@/lib/microsoft';

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
    const id = searchParams.get('id');

    if (id) {
      const email = await getEmailById(accessToken, id);
      return Response.json({ email }, { status: 200 });
    }

    const top = Number(searchParams.get('top') || '10');
    const emails = await listEmails(accessToken, top);

    return Response.json({ emails: emails.value }, { status: 200 });
  } catch (error: any) {
    const message = String(error?.message || '');
    const unauthorized =
      message.includes('(401)') || message.includes('InvalidAuthenticationToken');

    return Response.json(
      {
        message: unauthorized
          ? 'Microsoft token is expired or invalid. Reconnect Microsoft in Apps.'
          : 'Failed to fetch emails',
        error: error?.message || 'Unknown error',
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
};
