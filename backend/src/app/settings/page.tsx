'use client';

import { useState } from 'react';

type Diagnostics = {
  timestamp: string;
  activeProvider: 'direct' | 'none';
  microsoft: {
    expectedRedirectUri: string;
    activeRedirectUri: string;
    redirectUriMatchesAppUrl: boolean;
  };
  models: {
    routerModel: string;
    midModel: string;
    bigModel: string;
  };
  anthropic: {
    configured: boolean;
    apiKeyMasked: string | null;
    test: { reachable: boolean; error: string | null };
  };
  gemini: {
    configured: boolean;
    apiKeyMasked: string | null;
    test: { reachable: boolean; error: string | null };
  };
  recommendations: string[];
};

const ProviderCard = ({
  title,
  configured,
  keyMasked,
  reachable,
  error,
}: {
  title: string;
  configured: boolean;
  keyMasked: string | null;
  reachable: boolean;
  error: string | null;
}) => (
  <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
    <p className="font-medium text-black dark:text-white">{title}</p>
    <p className="mt-1 text-black/70 dark:text-white/70">Configured: {configured ? 'Yes' : 'No'}</p>
    <p className="text-black/70 dark:text-white/70">API key: {keyMasked || 'Not configured'}</p>
    <p className={reachable ? 'text-emerald-500' : 'text-amber-500'}>
      Connectivity: {reachable ? 'OK' : 'Not reachable'}
    </p>
    {error && <p className="mt-1 text-amber-500">{error}</p>}
  </div>
);

const SettingsPage = () => {
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState('');

  const runDiagnostics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/debug/integrations', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.message || 'Diagnostics request failed');
      }
      setDiagnostics(payload);
    } catch (err: any) {
      setError(err?.message || 'Failed to run diagnostics');
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Settings</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Direct provider diagnostics (Anthropic + Gemini) and Microsoft OAuth checks.
      </p>

      <div className="mt-6 rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm disabled:opacity-60"
        >
          {loading ? 'Running...' : 'Run Check'}
        </button>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {diagnostics && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
              <p className="font-medium text-black dark:text-white">Active Mode</p>
              <p className="mt-1 text-black/70 dark:text-white/70">
                Provider mode: <span className="font-semibold">{diagnostics.activeProvider}</span>
              </p>
            </div>

            <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
              <p className="font-medium text-black dark:text-white">Model Routing</p>
              <p className="mt-1 text-black/70 dark:text-white/70">
                Router: <span className="font-mono">{diagnostics.models.routerModel}</span>
              </p>
              <p className="text-black/70 dark:text-white/70">
                Mid: <span className="font-mono">{diagnostics.models.midModel}</span>
              </p>
              <p className="text-black/70 dark:text-white/70">
                Big: <span className="font-mono">{diagnostics.models.bigModel}</span>
              </p>
            </div>

            <ProviderCard
              title="Anthropic"
              configured={diagnostics.anthropic.configured}
              keyMasked={diagnostics.anthropic.apiKeyMasked}
              reachable={diagnostics.anthropic.test.reachable}
              error={diagnostics.anthropic.test.error}
            />

            <ProviderCard
              title="Gemini"
              configured={diagnostics.gemini.configured}
              keyMasked={diagnostics.gemini.apiKeyMasked}
              reachable={diagnostics.gemini.test.reachable}
              error={diagnostics.gemini.test.error}
            />

            <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
              <p className="font-medium text-black dark:text-white">Microsoft Redirect</p>
              <p className="mt-1 text-black/70 dark:text-white/70">
                Active: <span className="font-mono">{diagnostics.microsoft.activeRedirectUri}</span>
              </p>
              <p className="text-black/70 dark:text-white/70">
                Expected: <span className="font-mono">{diagnostics.microsoft.expectedRedirectUri}</span>
              </p>
              <p
                className={
                  diagnostics.microsoft.redirectUriMatchesAppUrl
                    ? 'text-emerald-500'
                    : 'text-amber-500'
                }
              >
                {diagnostics.microsoft.redirectUriMatchesAppUrl
                  ? 'Redirect URI matches APP_URL.'
                  : 'Redirect URI mismatch detected.'}
              </p>
            </div>

            {diagnostics.recommendations.length > 0 && (
              <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
                <p className="font-medium text-black dark:text-white">Fixes</p>
                <div className="mt-1 space-y-1">
                  {diagnostics.recommendations.map((item) => (
                    <p key={item} className="text-black/70 dark:text-white/70">
                      • {item}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;

