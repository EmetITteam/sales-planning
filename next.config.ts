import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Sentry tree-shake: видаляє console.log/debug у production build.
  // Замінює deprecated `disableLogger: true` у withSentryConfig (видалили нижче).
  webpack: (config, { dev, webpack: webpackInstance }) => {
    if (!dev) {
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpackInstance.DefinePlugin({
          __SENTRY_DEBUG__: false,
          __SENTRY_TRACING__: true,
        }),
      );
    }
    return config;
  },
};

// Sentry wrapper — runtime error tracking + source maps upload.
//
// Source maps:
//   - Upload активний коли є SENTRY_AUTH_TOKEN у env (інакше build лог
//     просто покаже warning, runtime error tracking працює без maps).
//   - Запускається лише на Vercel build (CI=true). Локальний `next build`
//     maps не заливає, щоб не сміттити Sentry releases.
//   - Після upload Sentry показує stack traces з нашими назвами файлів
//     (clients-page.tsx:1494) замість `lV` / `sm` minified-symbols.
//
// org/project — emet-0c / sales-planning (DSN указує на project id 4511512283775056).
export default withSentryConfig(nextConfig, {
  org: "emet-0c",
  project: "sales-planning",
  // Береться з env. Якщо немає — upload пропускається мовчки (не падає build).
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel route — обходить ad-blockers (вони часто блокують *.sentry.io).
  tunnelRoute: "/monitoring",
  // disableLogger перенесено у nextConfig.webpack (DefinePlugin __SENTRY_DEBUG__).
  // Це робить те саме (tree-shake console.log у prod) без deprecated warning.
  // widenClientFileUpload — заливає maps також для bundles _next/static/chunks/*
  // (не лише server/api). Без цього frontend errors лишаються minified.
  widenClientFileUpload: true,
  // Після успішного upload видаляємо .map файли з production bundle —
  // інакше будь-хто може скачати їх і відновити наш код. Sentry вже має
  // копії і resolve-ить stack traces зі свого боку.
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },
});
