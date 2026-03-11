import { callOpenRouterChat } from '@/lib/openrouter';
import { GROUNDED_SYSTEM_RULES } from '@/lib/prompts/grounding';

export const generateDeckOutline = async (input: {
  topic: string;
  source: string;
  model: string;
  slideCount?: number;
}) => {
  const slideCount = Math.min(15, Math.max(2, Number(input.slideCount || 6)));
  return callOpenRouterChat({
    model: input.model,
    temperature: 0.2,
    maxTokens: 1000,
    messages: [
      {
        role: 'system',
        content: `${GROUNDED_SYSTEM_RULES}
Create a practical outline for exactly ${slideCount} total slides.
Return plain text only in this structure:
Slide 1: <title>
- <point>
- <point>
Slide 2: <title>
- <point>
- <point>
Rules:
- No markdown symbols like ** or #.
- No disclaimer text.
- No references to limitations.
- Keep each bullet concise and specific to the topic.
- Do not repeat the user prompt verbatim.`,
      },
      {
        role: 'user',
        content: `Topic: ${input.topic}\n\nSource Material:\n${input.source}`,
      },
    ],
  });
};
