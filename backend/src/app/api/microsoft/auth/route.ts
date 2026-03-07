import { exchangeMicrosoftCode, getMicrosoftAuthUrl } from '@/lib/microsoft';

export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state') || undefined;

    if (!code) {
      return Response.json({ authUrl: getMicrosoftAuthUrl(state) }, { status: 200 });
    }

    const tokens = await exchangeMicrosoftCode(code);
    return Response.json({ tokens }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Microsoft auth failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};