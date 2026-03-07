import { callOpenRouterChat } from '@/lib/openrouter';

export const generateDeckOutline = async (input: {
  topic: string;
  source: string;
  model: string;
}) => {
  return callOpenRouterChat({
    model: input.model,
    temperature: 0.2,
    maxTokens: 1000,
    messages: [
      {
        role: 'system',
        content:
          'Create a practical 5-slide outline with slide title, key points, and speaker notes.',
      },
      {
        role: 'user',
        content: `Topic: ${input.topic}\n\nSource Material:\n${input.source}`,
      },
    ],
  });
};