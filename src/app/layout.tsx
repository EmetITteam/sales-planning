import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBootstrap } from "@/components/layout/session-bootstrap";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "EMET | Sales Planning",
  description: "Система планування та консолідації продажів",
  // PWA: коли додаток встановлено на iOS — title app-icon і status bar
  appleWebApp: {
    capable: true,
    title: 'Sales Planning',
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
    <html
      lang="uk"
      className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background">
        <SessionBootstrap>
          <TooltipProvider>{children}</TooltipProvider>
        </SessionBootstrap>
      </body>
    </html>
  );
}
