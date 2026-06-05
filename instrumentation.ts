/**
 * Next.js instrumentation hook — викликається 1 раз при старті server.
 * Завантажує Sentry config за runtime (nodejs / edge).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
