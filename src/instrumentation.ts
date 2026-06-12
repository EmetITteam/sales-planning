/**
 * Next.js instrumentation hook — викликається 1 раз при старті server.
 * У @sentry/nextjs v10 init робиться напряму тут (старі sentry.{server,edge}.config.ts
 * застаріли і не завантажуються автоматично).
 *
 * Файл повинен лежати у src/ (Next.js src-directory convention) — інакше
 * Next.js його не знаходить і register() не викликається.
 */

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/sentry-pii-scrubber';

// Sanitize: BOM + whitespace (див. sentry.client.config.ts для деталей).
const rawDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const dsn = rawDsn?.replace(/^﻿/, '').trim() || undefined;

export async function register() {
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV ?? 'development',
      // PII scrubber — обов'язково для server-side бо тут request body
      // містить логіни/паролі/PII клієнтів з форм планування / комментарів.
      beforeSend: scrubSentryEvent,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
