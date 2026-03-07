export type BingSearchResult = {
  name: string;
  url: string;
  snippet: string;
};

export const searchBing = async (
  query: string,
  count = 5,
): Promise<BingSearchResult[]> => {
  const apiKey = process.env.BING_API_KEY;

  if (!apiKey) {
    throw new Error('Missing BING_API_KEY');
  }

  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', `${Math.min(Math.max(count, 1), 5)}`);
  url.searchParams.set('textDecorations', 'false');
  url.searchParams.set('textFormat', 'Raw');

  const response = await fetch(url.toString(), {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bing search failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    webPages?: { value?: Array<{ name: string; url: string; snippet: string }> };
  };

  return (json.webPages?.value || []).map((item) => ({
    name: item.name,
    url: item.url,
    snippet: item.snippet,
  }));
};