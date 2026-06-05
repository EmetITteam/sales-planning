/**
 * Next.js instrumentation hook — викликається 1 раз при старті server.
 * Завантажує Sentry config за runtime (nodejs / edge).
 *
 * onRequestError — Next.js 15+ hook що тригериться на unhandled errors у
 * route handlers / server components. Sentry v10 ловить через
 * captureRequestError.
 */

import { captureRequestError } from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = captureRequestError;
