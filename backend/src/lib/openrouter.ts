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

export const callOpenRouterChat = async (
  input: OpenRouterChatOptions,
): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  const modelCandidates = getModelFallbacks(input.model);
  let lastError = '';

  for (const model of modelCandidates) {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'Atlas Brain',
      },
      body: JSON.stringify({
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `model=${model} status=${response.status} body=${errorText}`;
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

  throw new Error(`OpenRouter request failed across model fallbacks: ${lastError}`);
};
