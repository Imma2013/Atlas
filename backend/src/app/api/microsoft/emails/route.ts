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
    return Response.json(
      { message: 'Failed to fetch emails', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};