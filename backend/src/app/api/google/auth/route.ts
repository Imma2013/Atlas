import { exchangeGoogleCode, getGoogleAuthUrl } from '@/lib/google';
import {
  createGoogleOAuthState,
  isGoogleAppKey,
  parseGoogleOAuthState,
} from '@/lib/googleScopes';

export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state') || undefined;
    const appParam = searchParams.get('app');
    const app = isGoogleAppKey(appParam) ? appParam : undefined;

    if (!code) {
      const nonce = state || crypto.randomUUID();
      const authState = createGoogleOAuthState({ nonce, app });
      return Response.json(
        { authUrl: getGoogleAuthUrl({ state: authState, app }) },
        { status: 200 },
      );
    }

    const parsedState = parseGoogleOAuthState(state);
    const scopedApp = parsedState.app || app;
    const tokens = await exchangeGoogleCode({ code, app: scopedApp });
    return Response.json({ tokens, app: scopedApp || null }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Google auth failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};

