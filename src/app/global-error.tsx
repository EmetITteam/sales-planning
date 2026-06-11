'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'global' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="uk">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '32px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Критична помилка</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
          Програма не може продовжити роботу. Звіт надіслано.
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 8 }}>
            ID: {error.digest}
          </p>
        )}
        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: 16,
            padding: '10px 20px',
            borderRadius: 12,
            background: '#066aab',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Спробувати знову
        </button>
      </body>
    </html>
  );
}
