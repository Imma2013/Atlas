import { searchSearchCans } from '@/lib/searchcans';
import { searchWorkspace as searchMicrosoftWorkspace } from '@/lib/microsoft';
import { callOpenRouterChat } from '@/lib/openrouter';

export const searchWorkspace = async (input: {
  accessToken: string;
  query: string;
}) => searchMicrosoftWorkspace(input.accessToken, input.query);

export const searchWeb = async (input: {
  query: string;
  model: string;
}) => {
  const results = await searchSearchCans(input.query, 1);

  const summary = await callOpenRouterChat({
    model: input.model,
    temperature: 0.2,
    maxTokens: 700,
    messages: [
      {
        role: 'system',
        content:
          'Summarize the search results and include citations as bullet points with source URLs.',
      },
      {
        role: 'user',
        content: JSON.stringify(results),
      },
    ],
  });

  return {
    results,
    summary,
  };
};
