'use client';

import { useState } from 'react';

type ProviderDiagnostics = {
  configured: boolean;
  apiKeyMasked?: string | null;
  baseUrl?: string | null;
  siteUrl?: string;
  appName?: string;
  modelsEndpointReachable: boolean;
  discoveredModelCount: number;
  claudeTargets: Record<string, boolean>;
  error: string | null;
};

type Diagnostics = {
  timestamp: string;
  activeProvider: 'litellm' | 'openrouter' | 'none';
  microsoft: {
    expectedRedirectUri: string;
    activeRedirectUri: string;
    redirectUriMatchesAppUrl: boolean;
  };
  litellm: ProviderDiagnostics;
  openrouter: ProviderDiagnostics;
  recommendations: string[];
};

const ProviderCard = ({
  title,
  provider,
  isActive,
}: {
  title: string;
  provider: ProviderDiagnostics;
  isActive: boolean;
}) => {
  return (
    <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-black dark:text-white">{title}</p>
        {isActive && (
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
            Active
          </span>
        )}
      </div>
      <p className="mt-1 text-black/70 dark:text-white/70">
        Configured: {provider.configured ? 'Yes' : 'No'}
      </p>
      {provider.baseUrl && (
        <p className="text-black/70 dark:text-white/70">
          Base URL: <span className="font-mono">{provider.baseUrl}</span>
        </p>
      )}
      {'apiKeyMasked' in provider && (
        <p className="text-black/70 dark:text-white/70">
          API key: {provider.apiKeyMasked || 'Not configured'}
        </p>
      )}
      <p className="text-black/70 dark:text-white/70">
        Models reachable: {provider.modelsEndpointReachable ? 'Yes' : 'No'}
      </p>
      <p className="text-black/70 dark:text-white/70">
        Discovered models: {provider.discoveredModelCount}
      </p>
      <div className="mt-2 space-y-1">
        {Object.entries(provider.claudeTargets).map(([model, exists]) => (
          <p key={model} className={exists ? 'text-emerald-500' : 'text-amber-500'}>
            {exists ? '✓' : '•'} {model}
          </p>
        ))}
      </div>
      {provider.error && <p className="mt-2 text-amber-500">{provider.error}</p>}
    </div>
  );
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
          <p className="font-medium text-black dark:text-white">Integration Diagnostics</p>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Verify Microsoft OAuth and active LLM gateway connectivity.
          </p>
          <button
            onClick={runDiagnostics}
            disabled={loading}
            className="mt-3 px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm disabled:opacity-60"
          >
            {loading ? 'Running...' : 'Run Check'}
          </button>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          {diagnostics && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-light-200 dark:border-dark-200 p-3">
                <p className="font-medium text-black dark:text-white">Gateway Status</p>
                <p className="mt-1 text-black/70 dark:text-white/70">
                  Active provider: <span className="font-semibold">{diagnostics.activeProvider}</span>
                </p>
              </div>

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

              <ProviderCard
                title="LiteLLM"
                provider={diagnostics.litellm}
                isActive={diagnostics.activeProvider === 'litellm'}
              />
              <ProviderCard
                title="OpenRouter"
                provider={diagnostics.openrouter}
                isActive={diagnostics.activeProvider === 'openrouter'}
              />

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

