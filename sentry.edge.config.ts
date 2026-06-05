/**
 * Sentry edge config — для middleware і Edge runtime.
 *
 * У нашому проекті middleware легкий, але інстаpents Edge все одно
 * налаштовуємо щоб не пропускати crashes.
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
