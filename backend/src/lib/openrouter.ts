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

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';

const toPlainModel = (model: string) => model.replace(/^(anthropic|gemini)\//, '');

const normalizeAnthropicModel = (model: string) => {
  const plain = toPlainModel(model);
  const mapped: Record<string, string> = {
    'claude-haiku-4-5': 'claude-3-5-haiku-20241022',
    'claude-haiku-4.5': 'claude-3-5-haiku-20241022',
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
    'claude-sonnet-4.5': 'claude-sonnet-4-20250514',
    'claude-sonnet-4.6': 'claude-sonnet-4-20250514',
    'claude-opus-4': 'claude-opus-4-1-20250805',
    'claude-opus-4.1': 'claude-opus-4-1-20250805',
    'claude-opus-4.6': 'claude-opus-4-1-20250805',
  };

  return mapped[plain] || plain;
};

const normalizeGeminiModel = (model: string) => {
  const plain = toPlainModel(model);
  const mapped: Record<string, string> = {
    'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-pro',
  };

  return mapped[plain] || plain;
};

const resolveAliasModel = (model: string) => {
  switch (model) {
    case 'atlas-router':
      return process.env.ATLAS_ROUTER_MODEL || process.env.GEMINI_ROUTER_MODEL || 'gemini/gemini-2.5-flash-lite';
    case 'atlas-mid':
      return process.env.ATLAS_MID_MODEL || process.env.ANTHROPIC_MID_MODEL || 'anthropic/claude-sonnet-4-20250514';
    case 'atlas-big':
      return process.env.ATLAS_BIG_MODEL || process.env.ANTHROPIC_BIG_MODEL || 'anthropic/claude-opus-4-1-20250805';
    default:
      return model;
  }
};

const asAnthropicMessages = (messages: OpenRouterMessage[]) => {
  const system = messages
    .filter((msg) => msg.role === 'system')
    .map((msg) => msg.content)
    .join('\n\n')
    .trim();

  const chatMessages = messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));

  return { system, chatMessages };
};

const asGeminiPayload = (messages: OpenRouterMessage[]) => {
  const system = messages
    .filter((msg) => msg.role === 'system')
    .map((msg) => msg.content)
    .join('\n\n')
    .trim();

  const contents = messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

  return { system, contents };
};

const callAnthropic = async (input: OpenRouterChatOptions) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY');
  }

  const resolved = normalizeAnthropicModel(resolveAliasModel(input.model));
  const { system, chatMessages } = asAnthropicMessages(input.messages);

  const response = await fetch(ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: resolved,
      max_tokens: input.maxTokens ?? 800,
      temperature: input.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages: chatMessages,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = (payload.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Anthropic returned an empty response');
  }

  return text;
};

const callGemini = async (input: OpenRouterChatOptions) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  const resolved = normalizeGeminiModel(resolveAliasModel(input.model));
  const { system, contents } = asGeminiPayload(input.messages);

  const endpoint = `${GEMINI_BASE_URL}/models/${resolved}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxTokens ?? 800,
      },
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text;
};

const getGeminiFallbackFor = (model: string) => {
  const normalized = toPlainModel(resolveAliasModel(model));
  if (normalized.includes('opus')) return 'gemini/gemini-2.5-pro';
  if (normalized.includes('sonnet')) return 'gemini/gemini-2.5-flash';
  return 'gemini/gemini-2.5-flash-lite';
};

const getAnthropicFallbackFor = (model: string) => {
  const normalized = toPlainModel(resolveAliasModel(model));
  if (normalized.includes('pro')) return 'anthropic/claude-opus-4-1-20250805';
  if (normalized.includes('flash')) return 'anthropic/claude-3-5-haiku-20241022';
  return 'anthropic/claude-sonnet-4-20250514';
};

export const callOpenRouterChat = async (
  input: OpenRouterChatOptions,
): Promise<string> => {
  const model = resolveAliasModel(input.model);

  const providersToTry: Array<'anthropic' | 'gemini'> = [];
  if (model.startsWith('anthropic/') || model.startsWith('claude-')) {
    providersToTry.push('anthropic', 'gemini');
  } else if (model.startsWith('gemini/')) {
    providersToTry.push('gemini', 'anthropic');
  } else {
    if (process.env.ANTHROPIC_API_KEY) providersToTry.push('anthropic');
    if (process.env.GEMINI_API_KEY) providersToTry.push('gemini');
  }

  let lastError = '';
  for (const provider of providersToTry) {
    try {
      if (provider === 'anthropic') {
        const anthropicModel =
          model.startsWith('anthropic/') || model.startsWith('claude-')
            ? model.startsWith('anthropic/')
              ? model
              : `anthropic/${model}`
            : getAnthropicFallbackFor(model);
        return await callAnthropic({ ...input, model: anthropicModel });
      }

      const geminiModel = model.startsWith('gemini/')
        ? model
        : getGeminiFallbackFor(model);
      return await callGemini({ ...input, model: geminiModel });
    } catch (error: any) {
      lastError = `${provider}: ${error?.message || 'Unknown provider error'}`;
    }
  }

  throw new Error(
    lastError ||
      'No direct model provider configured. Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY.',
  );
};
