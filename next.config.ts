import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

// Sentry wrapper — runtime error tracking. Якщо DSN env порожній,
// configs мовчать (мають guard на dsn). Source maps upload не активуємо
// поки нема SENTRY_AUTH_TOKEN — runtime errors і так захоплюються.
export default withSentryConfig(nextConfig, {
  silent: true,
  // Tunnel route — обходить ad-blockers (вони часто блокують *.sentry.io).
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
