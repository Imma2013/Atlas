'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeMicrosoftTokens } from '@/lib/microsoftAuthClient';

const MicrosoftCallbackPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const finishOAuth = async () => {
      const code = searchParams.get('code');
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
        const response = await fetch(`/api/microsoft/auth?code=${encodeURIComponent(code)}`);
        const payload = await response.json();

        if (!response.ok || !payload?.tokens?.access_token) {
          throw new Error(payload?.message || 'Failed to complete Microsoft sign-in.');
        }

        storeMicrosoftTokens(payload.tokens);

        router.replace('/apps?connected=1');
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
            Finishing sign-in and redirecting back to Apps...
          </p>
        )}
      </div>
    </div>
  );
};

export default MicrosoftCallbackPage;
