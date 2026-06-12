/**
 * Sentry client config — для browser errors.
 *
 * DSN читається з NEXT_PUBLIC_SENTRY_DSN (Vercel ENV). Якщо порожній —
 * Sentry мовчки no-op (наприклад на локальному dev без налаштування).
 */

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-pii-scrubber';

// Sanitize: видаляємо BOM (﻿) і whitespace — Vercel env може містити
// невидимий BOM-маркер на початку якщо значення скопійоване з документа
// з encoding UTF-8-BOM. Sentry парсер на такому ламається з помилкою
// «Invalid Sentry Dsn».
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.replace(/^﻿/, '').trim() || undefined;

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
    // PII scrubber — чистить email/phone/login з URL, request body,
    // input values у breadcrumbs, cookies, auth headers перш ніж event
    // йде у Sentry. Аудит знахідка Sprint 2C (medium).
    beforeSend: scrubSentryEvent,
    // Session Replay теж може записати input value — забороняємо.
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
  });
}
