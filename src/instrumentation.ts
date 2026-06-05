/**
 * Next.js instrumentation hook — викликається 1 раз при старті server.
 * У @sentry/nextjs v10 init робиться напряму тут (старі sentry.{server,edge}.config.ts
 * застаріли і не завантажуються автоматично).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  console.log('[sentry-init] register() called, runtime:', process.env.NEXT_RUNTIME, 'dsn present:', !!dsn);
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      debug: false,
      environment: process.env.VERCEL_ENV ?? 'development',
    });
    console.log('[sentry-init] Sentry initialized for nodejs runtime');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      debug: false,
      environment: process.env.VERCEL_ENV ?? 'development',
    });
    console.log('[sentry-init] Sentry initialized for edge runtime');
  }
}

export const onRequestError = Sentry.captureRequestError;
