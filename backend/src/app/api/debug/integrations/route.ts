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

const normalizeBaseUrl = (raw: string) => raw.replace(/\/+$/, '');

const checkModelEndpoint = async (input: {
  endpoint: string;
  apiKey?: string;
}) => {
  const status = {
    modelsEndpointReachable: false,
    discoveredModelCount: 0,
    claudeTargets: Object.fromEntries(
      CLAUDE_TARGET_MODELS.map((model) => [model, false]),
    ),
    error: null as string | null,
  };

  try {
    const response = await fetch(input.endpoint, {
      headers: {
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    status.modelsEndpointReachable = response.ok;

    if (!response.ok) {
      status.error = `Models endpoint failed (${response.status}): ${await response.text()}`;
      return status;
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; model?: string }>;
    };
    const ids = (payload.data || [])
      .map((model) => model.id || model.model || '')
      .filter(Boolean);

    status.discoveredModelCount = ids.length;
    status.claudeTargets = Object.fromEntries(
      CLAUDE_TARGET_MODELS.map((model) => [model, ids.includes(model)]),
    );

    return status;
  } catch (error: any) {
    status.error = error?.message || 'Failed to reach model endpoint';
    return status;
  }
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

  const litellmBase = process.env.LITELLM_BASE_URL;
  const litellmModelsEndpoint = litellmBase
    ? `${normalizeBaseUrl(litellmBase)}/models`
    : null;
  const litellmKey = process.env.LITELLM_API_KEY || '';
  const openRouterKey = process.env.OPENROUTER_API_KEY || '';

  const activeProvider = litellmBase ? 'litellm' : openRouterKey ? 'openrouter' : 'none';

  const litellm = {
    configured: Boolean(litellmBase),
    baseUrl: litellmBase || null,
    apiKeyMasked: mask(litellmKey),
    ...(litellmModelsEndpoint
      ? await checkModelEndpoint({
          endpoint: litellmModelsEndpoint,
          apiKey: litellmKey || undefined,
        })
      : {
          modelsEndpointReachable: false,
          discoveredModelCount: 0,
          claudeTargets: Object.fromEntries(
            CLAUDE_TARGET_MODELS.map((model) => [model, false]),
          ),
          error: null,
        }),
  };

  const openrouter = {
    configured: Boolean(openRouterKey),
    apiKeyMasked: mask(openRouterKey),
    siteUrl: process.env.OPENROUTER_SITE_URL || appUrl,
    appName: process.env.OPENROUTER_APP_NAME || 'Atlas Brain',
    ...(openRouterKey
      ? await checkModelEndpoint({
          endpoint: OPENROUTER_MODELS_ENDPOINT,
          apiKey: openRouterKey,
        })
      : {
          modelsEndpointReachable: false,
          discoveredModelCount: 0,
          claudeTargets: Object.fromEntries(
            CLAUDE_TARGET_MODELS.map((model) => [model, false]),
          ),
          error: null,
        }),
  };

  return Response.json(
    {
      timestamp: new Date().toISOString(),
      activeProvider,
      microsoft,
      litellm,
      openrouter,
      recommendations: [
        microsoft.redirectUriMatchesAppUrl
          ? null
          : `Set MICROSOFT_REDIRECT_URI to ${microsoftRedirectExpected} and add the same URI in Azure App Registration.`,
        !litellm.configured
          ? 'Set LITELLM_BASE_URL to use Anthropic + Gemini direct keys through LiteLLM.'
          : null,
        litellm.configured && !litellm.modelsEndpointReachable
          ? 'LiteLLM is configured but /models is not reachable. Check URL, key, and LiteLLM deployment.'
          : null,
        !litellm.configured && !openrouter.configured
          ? 'Set either LITELLM_BASE_URL (preferred) or OPENROUTER_API_KEY.'
          : null,
      ].filter(Boolean),
    },
    { status: 200 },
  );
};

