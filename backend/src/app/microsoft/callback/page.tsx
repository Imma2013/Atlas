'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeMicrosoftTokens } from '@/lib/microsoftAuthClient';
import { MICROSOFT_APP_LABELS, parseOAuthState } from '@/lib/microsoftScopes';

const MicrosoftCallbackPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Finishing sign-in and redirecting back to Settings...');

  useEffect(() => {
    const finishOAuth = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const incomingError = searchParams.get('error_description') || searchParams.get('error');

      if (incomingError) {
        setError(incomingError);
        return;
      }

      if (!code) {
        setError('Missing authorization code.');
        return;
      }

      try {
        const parsedState = parseOAuthState(state);
        const appLabel =
          parsedState.app === 'all'
            ? 'Microsoft 365 (All Apps)'
            : parsedState.app
              ? MICROSOFT_APP_LABELS[parsedState.app]
              : 'Microsoft';
        setStatus(`Finalizing ${appLabel} connection...`);
        const response = await fetch(
          `/api/microsoft/auth?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`,
        );
        const payload = await response.json();

        if (!response.ok || !payload?.tokens?.access_token) {
          throw new Error(payload?.message || 'Failed to complete Microsoft sign-in.');
        }

        storeMicrosoftTokens(payload.tokens);

        const app = payload?.app || parsedState.app || '';
        router.replace(`/settings?tab=connections&connected=1${app ? `&app=${encodeURIComponent(app)}` : ''}`);
      } catch (oauthError: any) {
        setError(oauthError?.message || 'Microsoft sign-in failed.');
      }
    };

    finishOAuth();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-light-200 dark:border-dark-200 p-6 bg-light-primary dark:bg-dark-primary">
        <h1 className="text-lg font-semibold text-black dark:text-white">Microsoft Connection</h1>
        {error ? (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        ) : (
          <p className="mt-2 text-sm text-black/65 dark:text-white/65">
            {status}
          </p>
        )}
      </div>
    </div>
  );
};

export default MicrosoftCallbackPage;
