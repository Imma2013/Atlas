export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTHROPIC_TEST_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const normalizeAppBaseUrl = (value?: string) =>
  (value || 'http://localhost:3000').trim().replace(/\/+$/, '');

const normalizeRedirectUri = (value: string) => {
  try {
    const url = new URL(value.trim());
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return value.trim();
  }
};

const mask = (value?: string) => {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const normalizeAnthropicModelForCheck = (model: string) => {
  const plain = model.replace(/^anthropic\//, '');
  const mapped: Record<string, string> = {
    'claude-sonnet-4.6': 'claude-sonnet-4-20250514',
    'claude-sonnet-4.5': 'claude-sonnet-4-20250514',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
    'claude-opus-4.6': 'claude-opus-4-1-20250805',
    'claude-opus-4.1': 'claude-opus-4-1-20250805',
    'claude-opus-4': 'claude-opus-4-1-20250805',
    'claude-haiku-4-5': 'claude-3-5-haiku-20241022',
    'claude-haiku-4.5': 'claude-3-5-haiku-20241022',
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
  };
  return mapped[plain] || plain;
};

const normalizeGeminiModelForCheck = (model: string) => {
  const plain = model.replace(/^gemini\//, '');
  const mapped: Record<string, string> = {
    'gemini-2.0-flash': 'gemini-2.5-flash',
    'gemini-2.0-flash-exp': 'gemini-2.5-flash',
  };
  return mapped[plain] || plain;
};

const testAnthropic = async (apiKey: string, model: string) => {
  const result = { reachable: false, error: null as string | null };
  try {
    const response = await fetch(ANTHROPIC_TEST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: normalizeAnthropicModelForCheck(model),
        max_tokens: 16,
        temperature: 0,
        messages: [{ role: 'user', content: 'reply with ok' }],
      }),
      cache: 'no-store',
    });

    result.reachable = response.ok;
    if (!response.ok) {
      result.error = `Anthropic test failed (${response.status}): ${await response.text()}`;
    }
  } catch (error: any) {
    result.error = error?.message || 'Anthropic test request failed';
  }
  return result;
};

const testGemini = async (apiKey: string, model: string) => {
  const result = { reachable: false, error: null as string | null };
  try {
    const endpoint = `${GEMINI_BASE_URL}/models/${normalizeGeminiModelForCheck(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'reply with ok' }] }],
      }),
      cache: 'no-store',
    });
    result.reachable = response.ok;
    if (!response.ok) {
      result.error = `Gemini test failed (${response.status}): ${await response.text()}`;
    }
  } catch (error: any) {
    result.error = error?.message || 'Gemini test request failed';
  }
  return result;
};

export const GET = async () => {
  const appUrl = normalizeAppBaseUrl(process.env.APP_URL);
  const microsoftRedirectExpected = `${appUrl}/microsoft/callback`;
  const microsoftRedirectConfigured = normalizeRedirectUri(
    process.env.MICROSOFT_REDIRECT_URI || microsoftRedirectExpected,
  );

  const routerModel =
    process.env.ATLAS_ROUTER_MODEL ||
    (process.env.GEMINI_API_KEY ? 'gemini/gemini-2.5-flash-lite' : 'anthropic/claude-3-5-haiku-20241022');
  const midModel = process.env.ATLAS_MID_MODEL || 'anthropic/claude-sonnet-4-20250514';
  const bigModel = process.env.ATLAS_BIG_MODEL || 'anthropic/claude-opus-4-1-20250805';

  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  const [anthropicTest, geminiTest] = await Promise.all([
    anthropicKey ? testAnthropic(anthropicKey, midModel) : Promise.resolve({ reachable: false, error: null }),
    geminiKey ? testGemini(geminiKey, routerModel.startsWith('gemini/') ? routerModel : 'gemini/gemini-2.5-flash-lite') : Promise.resolve({ reachable: false, error: null }),
  ]);

  return Response.json(
    {
      timestamp: new Date().toISOString(),
      activeProvider: anthropicKey || geminiKey ? 'direct' : 'none',
      microsoft: {
        expectedRedirectUri: microsoftRedirectExpected,
        activeRedirectUri: microsoftRedirectConfigured,
        redirectUriMatchesAppUrl:
          microsoftRedirectConfigured === microsoftRedirectExpected,
      },
      models: {
        routerModel,
        midModel,
        bigModel,
      },
      anthropic: {
        configured: Boolean(anthropicKey),
        apiKeyMasked: mask(anthropicKey),
        test: anthropicTest,
      },
      gemini: {
        configured: Boolean(geminiKey),
        apiKeyMasked: mask(geminiKey),
        test: geminiTest,
      },
      recommendations: [
        microsoftRedirectConfigured === microsoftRedirectExpected
          ? null
          : `Set MICROSOFT_REDIRECT_URI to ${microsoftRedirectExpected} and add the same URI in Azure App Registration.`,
        !anthropicKey ? 'Set ANTHROPIC_API_KEY for Sonnet/Opus workloads.' : null,
        !geminiKey ? 'Set GEMINI_API_KEY for cheap router/default fallback.' : null,
      ].filter(Boolean),
    },
    { status: 200 },
  );
};
