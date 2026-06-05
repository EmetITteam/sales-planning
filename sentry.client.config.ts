/**
 * Sentry client config — для browser errors.
 *
 * DSN читається з NEXT_PUBLIC_SENTRY_DSN (Vercel ENV). Якщо порожній —
 * Sentry мовчки no-op (наприклад на локальному dev без налаштування).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Performance traces — 10% запитів, щоб бачити slow endpoints без
    // перевантаження free tier (100k events/month).
    tracesSampleRate: 0.1,
    // Session Replay тільки для помилок — економія тier.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Дебаг тільки локально, у проді мовчимо.
    debug: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  });
}
