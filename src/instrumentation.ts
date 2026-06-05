/**
 * Next.js instrumentation hook — викликається 1 раз при старті server.
 * У @sentry/nextjs v10 init робиться напряму тут (старі sentry.{server,edge}.config.ts
 * застаріли і не завантажуються автоматично).
 *
 * Файл повинен лежати у src/ (Next.js src-directory convention) — інакше
 * Next.js його не знаходить і register() не викликається.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV ?? 'development',
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
