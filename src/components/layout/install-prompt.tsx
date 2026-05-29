'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISS_KEY = 'emet:installPromptDismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Невеликий банер який пропонує встановити Sales Planning як PWA.
 *
 * Логіка:
 *  - Chromium (Chrome/Edge/Brave/Opera): при `beforeinstallprompt` ловимо event,
 *    показуємо кнопку «Встановити» — клік тригерить native install dialog.
 *  - iOS Safari: немає API → показуємо текстову інструкцію (Share → Add to Home).
 *  - Якщо вже встановлено (display-mode: standalone) → не показуємо.
 *  - Користувач dismiss → не показуємо більше (localStorage).
 *
 * Чому не показуємо завжди — щоб не дратувати. Один раз в очі і все.
 */
// Sync детекція початкового стану (iOS Safari + standalone + dismissed) —
// у lazy useState init щоб не cascade-render через setState в effect.
function getInitialState(): { showIosHint: boolean; dismissed: boolean } {
  if (typeof window === 'undefined') return { showIosHint: false, dismissed: true };
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) return { showIosHint: false, dismissed: true };
  if (localStorage.getItem(DISMISS_KEY) === '1') return { showIosHint: false, dismissed: true };
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIos && isSafari) return { showIosHint: true, dismissed: false };
  return { showIosHint: false, dismissed: true }; // chromium показуємо лише коли beforeinstallprompt спрацює
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [{ showIosHint, dismissed }, setState] = useState(getInitialState);

  useEffect(() => {
    // Chromium event — приходить async, тому setState у effect це коректно.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState(prev => ({ ...prev, dismissed: false }));
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      // Встановлено — приховуємо банер. localStorage ставити не треба бо
      // вже не побачимо (display-mode standalone).
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setState(prev => ({ ...prev, dismissed: true }));
  };

  if (dismissed) return null;
  // Нічого корисного показати — Safari десктоп не має ні installer ні Share-меню
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div className="bg-gradient-to-r from-emet-blue/5 via-emet-blue-light/5 to-emet-blue/5 border border-emet-blue/15 rounded-2xl p-3 md:p-4 flex items-center gap-3">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white shrink-0">
        <Download className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-foreground">Встановити як додаток</p>
        {showIosHint ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            <Share className="inline h-3 w-3 -mt-0.5 mr-0.5" />
            Поділитись → «На головний екран» — іконка з&apos;явиться як native додаток
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Іконка на робочий стіл, повноекранний режим без вкладок браузера
          </p>
        )}
      </div>
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap shrink-0"
        >
          Встановити
        </button>
      )}
      <button
        onClick={handleDismiss}
        aria-label="Закрити"
        className="p-1.5 rounded-lg hover:bg-emet-blue/10 text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
