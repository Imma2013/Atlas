export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterChatOptions = {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const LITELLM_DEFAULT_BASE = 'http://localhost:4000';

const getModelFallbacks = (model: string): string[] => {
  if (model === 'anthropic/claude-sonnet-4') {
    return [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-4-sonnet-20250522',
    ];
  }

  if (model === 'anthropic/claude-opus-4') {
    return [
      'anthropic/claude-opus-4',
      'anthropic/claude-opus-4.1',
      'anthropic/claude-opus-4.6',
      'anthropic/claude-4-opus-20250522',
    ];
  }

  if (model === 'anthropic/claude-haiku-4.5') {
    return ['anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-3.5'];
  }

  return [model];
};

const normalizeBaseUrl = (raw: string) => raw.replace(/\/+$/, '');

const getGatewayConfig = () => {
  const litellmBaseUrl = process.env.LITELLM_BASE_URL;
  const litellmApiKey = process.env.LITELLM_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (litellmBaseUrl) {
    return {
      provider: 'litellm' as const,
      endpoint: `${normalizeBaseUrl(litellmBaseUrl || LITELLM_DEFAULT_BASE)}/chat/completions`,
      apiKey: litellmApiKey || '',
      extraHeaders: {} as Record<string, string>,
    };
  }

  if (openRouterApiKey) {
    return {
      provider: 'openrouter' as const,
      endpoint: OPENROUTER_URL,
      apiKey: openRouterApiKey,
      extraHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'Atlas Brain',
      } as Record<string, string>,
    };
  }

  throw new Error('Missing LITELLM_BASE_URL (preferred) or OPENROUTER_API_KEY');
};

export const callOpenRouterChat = async (
  input: OpenRouterChatOptions,
): Promise<string> => {
  const gateway = getGatewayConfig();
  const modelCandidates = getModelFallbacks(input.model);
  let lastError = '';

  for (const model of modelCandidates) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...gateway.extraHeaders,
    };
    if (gateway.apiKey) {
      headers.Authorization = `Bearer ${gateway.apiKey}`;
    }

    const response = await fetch(gateway.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 800,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `provider=${gateway.provider} model=${model} status=${response.status} body=${errorText}`;
      continue;
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (content) {
      return content;
    }
  }

  throw new Error(
    `LLM gateway request failed across model fallbacks: ${lastError}`,
  );
};
