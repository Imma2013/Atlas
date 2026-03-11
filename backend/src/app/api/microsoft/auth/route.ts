import { exchangeMicrosoftCode, getMicrosoftAuthUrl } from '@/lib/microsoft';
import { createOAuthState, isMicrosoftScopeTarget, parseOAuthState } from '@/lib/microsoftScopes';

export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state') || undefined;
    const appParam = searchParams.get('app');
    const app = isMicrosoftScopeTarget(appParam) ? appParam : undefined;

    if (!code) {
      const nonce = state || crypto.randomUUID();
      const authState = createOAuthState({ nonce, app });
      return Response.json({ authUrl: getMicrosoftAuthUrl({ state: authState, app }) }, { status: 200 });
    }

    const parsedState = parseOAuthState(state);
    const scopedApp = parsedState.app || app;
    const tokens = await exchangeMicrosoftCode({ code, app: scopedApp });
    return Response.json({ tokens, app: scopedApp || null }, { status: 200 });
  } catch (error: any) {
    return Response.json(
      { message: 'Microsoft auth failed', error: error?.message || 'Unknown error' },
      { status: 500 },
    );
  }
};
