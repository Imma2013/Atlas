export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

const CLAUDE_TARGET_MODELS = [
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
];

const mask = (value?: string) => {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export const GET = async () => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const microsoftRedirectExpected = `${appUrl}/microsoft/callback`;
  const microsoftRedirectConfigured =
    process.env.MICROSOFT_REDIRECT_URI || microsoftRedirectExpected;

  const microsoft = {
    clientIdConfigured: Boolean(process.env.MICROSOFT_CLIENT_ID),
    clientSecretConfigured: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
    tenantConfigured: Boolean(process.env.MICROSOFT_TENANT_ID),
    appUrlConfigured: Boolean(process.env.APP_URL),
    redirectUriConfigured: Boolean(process.env.MICROSOFT_REDIRECT_URI),
    expectedRedirectUri: microsoftRedirectExpected,
    activeRedirectUri: microsoftRedirectConfigured,
    redirectUriMatchesAppUrl:
      microsoftRedirectConfigured === microsoftRedirectExpected,
  };

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openrouter: Record<string, any> = {
    apiKeyConfigured: Boolean(openRouterKey),
    apiKeyMasked: mask(openRouterKey),
    siteUrl: process.env.OPENROUTER_SITE_URL || appUrl,
    appName: process.env.OPENROUTER_APP_NAME || 'Atlas Brain',
    modelsEndpointReachable: false,
    discoveredModelCount: 0,
    claudeTargets: Object.fromEntries(
      CLAUDE_TARGET_MODELS.map((model) => [model, false]),
    ),
    error: null,
  };

  if (openRouterKey) {
    try {
      const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      openrouter.modelsEndpointReachable = response.ok;

      if (!response.ok) {
        const text = await response.text();
        openrouter.error = `OpenRouter models failed (${response.status}): ${text}`;
      } else {
        const payload = (await response.json()) as {
          data?: Array<{ id?: string }>;
        };
        const ids = (payload.data || [])
          .map((model) => model.id || '')
          .filter(Boolean);

        openrouter.discoveredModelCount = ids.length;
        openrouter.claudeTargets = Object.fromEntries(
          CLAUDE_TARGET_MODELS.map((model) => [model, ids.includes(model)]),
        );
      }
    } catch (error: any) {
      openrouter.error = error?.message || 'Failed to reach OpenRouter models endpoint';
    }
  }

  return Response.json(
    {
      timestamp: new Date().toISOString(),
      microsoft,
      openrouter,
      recommendations: [
        microsoft.redirectUriMatchesAppUrl
          ? null
          : `Set MICROSOFT_REDIRECT_URI to ${microsoftRedirectExpected} and add the same URI in Azure App Registration.`,
        !openrouter.apiKeyConfigured
          ? 'Set OPENROUTER_API_KEY in Vercel environment variables.'
          : null,
      ].filter(Boolean),
    },
    { status: 200 },
  );
};

