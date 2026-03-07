export type SupabaseMethod = 'GET' | 'POST' | 'PATCH';

const getEnv = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return { url, serviceKey };
};

export const hasSupabaseAdmin = () => {
  const { url, serviceKey } = getEnv();
  return Boolean(url && serviceKey);
};

export const supabaseAdminRequest = async <T>(input: {
  path: string;
  method?: SupabaseMethod;
  body?: unknown;
  query?: Record<string, string>;
  prefer?: string;
}): Promise<T> => {
  const { url, serviceKey } = getEnv();

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const endpoint = new URL(`${url}/rest/v1/${input.path}`);

  Object.entries(input.query || {}).forEach(([key, value]) => {
    endpoint.searchParams.set(key, value);
  });

  const response = await fetch(endpoint.toString(), {
    method: input.method || 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: input.prefer || 'return=representation',
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};