/**
 * Sentry server config — для backend errors (API routes, server components).
 *
 * DSN читається з SENTRY_DSN (server-only) або NEXT_PUBLIC_SENTRY_DSN
 * як fallback. Якщо порожній — no-op.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

// DEBUG log щоб у Vercel logs побачити чи init спрацював
console.log('[sentry-init] server config, dsn present:', !!dsn, 'env:', process.env.VERCEL_ENV);

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: true,
    environment: process.env.VERCEL_ENV ?? 'development',
  });
  console.log('[sentry-init] Sentry.init called for server');
}
