import { callOpenRouterChat } from '@/lib/openrouter';
import { GROUNDED_SYSTEM_RULES } from '@/lib/prompts/grounding';

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
        content: `${GROUNDED_SYSTEM_RULES}\nYou summarize ${input.context} clearly with concise action-oriented output.`,
      },
      {
        role: 'user',
        content: input.content,
      },
    ],
  });
};
