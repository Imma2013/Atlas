export type ChatModelOption = {
  value: string;
  label: string;
  provider: 'anthropic' | 'gemini';
  tier: 'router' | 'mid' | 'big' | 'general';
};

// Canonical direct-provider model IDs for chat selection.
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    value: 'gemini/gemini-2.5-flash',
    label: 'ATLAS JIT (Gemini Flash)',
    provider: 'gemini',
    tier: 'router',
  },
  {
    value: 'anthropic/claude-3-5-haiku-20241022',
    label: 'ATLAS Router (Haiku)',
    provider: 'anthropic',
    tier: 'router',
  },
  {
    value: 'anthropic/claude-sonnet-4.6',
    label: 'ATLAS Final (Sonnet 4.6)',
    provider: 'anthropic',
    tier: 'mid',
  },
  {
    value: 'anthropic/claude-opus-4.6',
    label: 'ATLAS Final+ (Opus 4.6)',
    provider: 'anthropic',
    tier: 'big',
  },
  {
    value: 'anthropic/claude-3-7-sonnet-20250219',
    label: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    tier: 'mid',
  },
  {
    value: 'gemini/gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    provider: 'gemini',
    tier: 'router',
  },
  {
    value: 'gemini/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'gemini',
    tier: 'mid',
  },
  {
    value: 'gemini/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'gemini',
    tier: 'big',
  },
];

export const DEFAULT_CHAT_MODEL = 'anthropic/claude-sonnet-4.6';
