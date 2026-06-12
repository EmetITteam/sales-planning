'use client';

/**
 * Route-level Error Boundary (Next.js 16 convention).
 *
 * Ловить render-помилки у будь-якій сторінці під src/app/ і показує
 * красивий fallback замість white-screen. Все що ловиться — автоматично
 * репортиться у Sentry з componentStack (тепер видно НАШИХ компонентів
 * замість minified lV/sm/sh завдяки source maps).
 *
 * Не ловить: помилки у root layout — для них окремий global-error.tsx.
 */

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle } from 'lucide-react';

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'route' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="glass-card-flat max-w-md w-full p-6 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />
        <h2 className="mt-3 text-[15px] font-bold text-slate-800">Щось пішло не так</h2>
        <p className="mt-1 text-[12px] text-slate-600">
          Сторінка не змогла завантажитись. Звіт уже відправлено розробникам.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] text-muted-foreground font-mono">ID: {error.digest}</p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-emet-blue text-white text-[13px] font-semibold active:scale-[0.98] transition-all"
          >
            Спробувати знову
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            className="inline-flex items-center justify-center h-9 px-5 rounded-xl bg-white/70 text-slate-700 border border-slate-200 text-[12px] font-semibold active:scale-[0.98] transition-all"
          >
            На головну
          </button>
        </div>
      </div>
    </div>
  );
}
