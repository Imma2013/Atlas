import { searchSearchCans } from '@/lib/searchcans';
import { searchWorkspace as searchMicrosoftWorkspace } from '@/lib/microsoft';
import { searchGoogleWorkspace as searchGoogleWorkspaceImpl } from '@/lib/google';
import { callOpenRouterChat } from '@/lib/openrouter';
import { GROUNDED_SYSTEM_RULES } from '@/lib/prompts/grounding';
import { searchWebWithPlaywright } from '@/lib/playwrightSearch';

export const searchWorkspace = async (input: {
  accessToken: string;
  query: string;
}) => searchMicrosoftWorkspace(input.accessToken, input.query);

export const searchGoogleWorkspace = async (input: {
  accessToken: string;
  query: string;
}) => searchGoogleWorkspaceImpl(input.accessToken, input.query);

export const searchWeb = async (input: {
  query: string;
  model: string;
}) => {
  const provider = (process.env.ATLAS_WEB_SEARCH_PROVIDER || 'playwright').toLowerCase();
  let results: Array<{
    name: string;
    url: string;
    snippet: string;
    content?: string;
  }> = [];
  let providerUsed: 'playwright' | 'searchcans' = 'playwright';

  try {
    if (provider === 'searchcans') {
      results = await searchSearchCans(input.query, 1);
      providerUsed = 'searchcans';
    } else {
      results = await searchWebWithPlaywright(input.query, 5);
      providerUsed = 'playwright';
    }
  } catch {
    // Fail-open fallback to SearchCans if Playwright extraction is unavailable.
    results = await searchSearchCans(input.query, 1);
    providerUsed = 'searchcans';
  }

  const summary = await callOpenRouterChat({
    model: input.model,
    temperature: 0.2,
    maxTokens: 700,
    messages: [
      {
        role: 'system',
        content: `${GROUNDED_SYSTEM_RULES}\nSummarize the search results and include citations as bullet points with source URLs.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          provider: providerUsed,
          query: input.query,
          results,
        }),
      },
    ],
  });

  return {
    results,
    summary,
    provider: providerUsed,
  };
};
