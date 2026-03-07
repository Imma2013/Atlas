import { callOpenRouterChat } from '@/lib/openrouter';

export const summarizeText = async (input: {
  content: string;
  context: string;
  model: string;
}) => {
  return callOpenRouterChat({
    model: input.model,
    temperature: 0.2,
    maxTokens: 700,
    messages: [
      {
        role: 'system',
        content: `You summarize ${input.context} clearly with concise action-oriented output.`,
      },
      {
        role: 'user',
        content: input.content,
      },
    ],
  });
};