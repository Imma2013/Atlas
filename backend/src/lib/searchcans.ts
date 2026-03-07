export type SearchCansSearchResult = {
  name: string;
  url: string;
  snippet: string;
};

type SearchCansResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    description?: string;
    content?: string;
  }>;
  data?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    description?: string;
    content?: string;
  }>;
};

export const searchSearchCans = async (
  query: string,
  page = 1,
): Promise<SearchCansSearchResult[]> => {
  const apiKey = process.env.SEARCHCANS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing SEARCHCANS_API_KEY');
  }

  const response = await fetch('https://www.searchcans.com/api/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      s: query,
      t: 'google',
      p: Math.max(1, page),
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SearchCans search failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as SearchCansResponse;
  const rawResults = json.results || json.data || [];

  return rawResults
    .filter((item) => item.url)
    .slice(0, 5)
    .map((item) => ({
      name: item.title || 'Untitled Result',
      url: item.url || '',
      snippet: item.snippet || item.description || item.content || '',
    }));
};
