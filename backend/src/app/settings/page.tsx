'use client';

import { useState } from 'react';

type Diagnostics = {
  timestamp: string;
  microsoft: {
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    tenantConfigured: boolean;
    appUrlConfigured: boolean;
    redirectUriConfigured: boolean;
    expectedRedirectUri: string;
    activeRedirectUri: string;
    redirectUriMatchesAppUrl: boolean;
  };
  openrouter: {
    apiKeyConfigured: boolean;
    apiKeyMasked: string | null;
    siteUrl: string;
    appName: string;
    modelsEndpointReachable: boolean;
    discoveredModelCount: number;
    claudeTargets: Record<string, boolean>;
    error: string | null;
  };
  recommendations: string[];
};

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
        Chat preferences and integration diagnostics.
      </p>

      <div className="mt-6 space-y-3">
        <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
          <p className="font-medium text-black dark:text-white">Preferences</p>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Theme, measurement units, and UI behavior.
          </p>
        </div>
        <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
          <p className="font-medium text-black dark:text-white">Personalization</p>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            System instructions for your responses.
          </p>
        </div>
        <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-black dark:text-white">Integration Diagnostics</p>
              <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                Verify Microsoft OAuth + OpenRouter model availability.
              </p>
            </div>
            <button
              onClick={runDiagnostics}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm disabled:opacity-60"
            >
              {loading ? 'Running...' : 'Run Check'}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          {diagnostics && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
                <p className="font-medium text-black dark:text-white">Microsoft</p>
                <p className="mt-1 text-black/70 dark:text-white/70">
                  Active redirect: <span className="font-mono">{diagnostics.microsoft.activeRedirectUri}</span>
                </p>
                <p className="text-black/70 dark:text-white/70">
                  Expected redirect: <span className="font-mono">{diagnostics.microsoft.expectedRedirectUri}</span>
                </p>
                <p
                  className={
                    diagnostics.microsoft.redirectUriMatchesAppUrl ? 'text-emerald-500' : 'text-amber-500'
                  }
                >
                  {diagnostics.microsoft.redirectUriMatchesAppUrl
                    ? 'Redirect URI matches APP_URL.'
                    : 'Redirect URI mismatch detected.'}
                </p>
              </div>

              <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
                <p className="font-medium text-black dark:text-white">OpenRouter</p>
                <p className="mt-1 text-black/70 dark:text-white/70">
                  API key: {diagnostics.openrouter.apiKeyMasked || 'Not configured'}
                </p>
                <p className="text-black/70 dark:text-white/70">
                  Models reachable: {diagnostics.openrouter.modelsEndpointReachable ? 'Yes' : 'No'}
                </p>
                <p className="text-black/70 dark:text-white/70">
                  Discovered models: {diagnostics.openrouter.discoveredModelCount}
                </p>
                <div className="mt-2 space-y-1">
                  {Object.entries(diagnostics.openrouter.claudeTargets).map(([model, exists]) => (
                    <p key={model} className={exists ? 'text-emerald-500' : 'text-amber-500'}>
                      {exists ? '✓' : '•'} {model}
                    </p>
                  ))}
                </div>
                {diagnostics.openrouter.error && (
                  <p className="mt-2 text-amber-500">{diagnostics.openrouter.error}</p>
                )}
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
    </div>
  );
};

export default SettingsPage;

