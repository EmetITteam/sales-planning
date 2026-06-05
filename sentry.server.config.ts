/**
 * Sentry server config — для backend errors (API routes, server components).
 *
 * DSN читається з SENTRY_DSN (server-only) або NEXT_PUBLIC_SENTRY_DSN
 * як fallback. Якщо порожній — no-op.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    environment: process.env.VERCEL_ENV ?? 'development',
  });
}
