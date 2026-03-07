import { getCurrentUser } from '@/lib/microsoft';

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

    const profile = await getCurrentUser(accessToken);
    return Response.json({ profile }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Failed to fetch Microsoft profile', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};

