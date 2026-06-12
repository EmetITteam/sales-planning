import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBootstrap } from "@/components/layout/session-bootstrap";
import { ZoomGuard } from "@/components/layout/zoom-guard";
import { ScrollTopButton } from "@/components/layout/scroll-top-button";
import { Analytics } from "@vercel/analytics/react";

// ⚠️ next/font/google вимкнено 2026-05-21: після переходу на Vercel Pro
// build не завантажував файли шрифтів у `/_next/static/media/`, у UI
// з'являвся system fallback. Тепер шрифти включаємо напряму через
// <link> до fonts.googleapis.com — менш оптимально (runtime request
// замість preload), але працює гарантовано.

export const metadata: Metadata = {
  title: "EMET | Планування продажів",
  description: "Система планування та консолідації продажів",
  // PWA: коли додаток встановлено на iOS — title app-icon і status bar
  appleWebApp: {
    capable: true,
    title: 'Планування продажів',
    statusBarStyle: 'default',
  },
  // Не дозволяємо автоматичне розпізнавання телефонів/email/адрес — на дашборді
  // суми типу "$1,500" раніше Safari робив clickable phone link.
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#066aab',
  width: 'device-width',
  initialScale: 1,
  // У PWA standalone-mode користувач не має браузерного chrome — фіксуємо
  // viewport щоб не було pinch-zoom на дашборді з таблицями (zoom ламає grid).
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className="h-full antialiased">
      <head>
        {/* Явний viewport meta. Next.js viewport API серіалізує
            `userScalable: false` у `user-scalable=no`, але iOS Safari
            <16 ігнорує його якщо не написано всі три (minimum/maximum/
            user-scalable) у одному тегу. Явний тег ➜ pinch-zoom
            гарантовано вимкнено в PWA standalone і у Safari табі. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background">
        <ZoomGuard />
        {/* Glass redesign — animated background mesh + floating blobs + noise.
            Лежать за всім контентом (z-index: -2/-1). prefers-reduced-motion
            вимикає анімацію через CSS. */}
        <div className="glass-mesh" aria-hidden />
        <div className="glass-blob glass-blob-a" aria-hidden />
        <div className="glass-blob glass-blob-b" aria-hidden />
        <div className="glass-blob glass-blob-c" aria-hidden />
        <div className="glass-blob glass-blob-d" aria-hidden />
        <div className="glass-noise" aria-hidden />
        <SessionBootstrap>
          <TooltipProvider>{children}</TooltipProvider>
        </SessionBootstrap>
        <ScrollTopButton />
        {/* Vercel Analytics — page views, geo, devices. Free tier на
            Vercel Pro: 100k events/міс (вистачає на 21 менеджера). Не
            трекає PII, лише агрегати. */}
        <Analytics />
      </body>
    </html>
  );
}
