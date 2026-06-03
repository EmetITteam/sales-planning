/**
 * ZoomGuard — клієнтський компонент що блокує pinch-zoom на JS-рівні.
 *
 * Чому окремо:
 *  - iOS Safari часто ігнорує `<meta name="viewport" user-scalable=no>` до
 *    React hydration. У ці перші ~300мс користувач встигає zoom-нути двома
 *    пальцями і zoom фіксується — meta потім вже не reset-ить.
 *  - Chrome mobile поважає meta, АЛЕ accessibility-flag «Force enable zoom»
 *    у налаштуваннях браузера override-ить наш user-scalable=no. Користувачі
 *    з ввімкненим flag-ом zoom-нуть незалежно від meta.
 *  - `touch-action: pan-y` блокує pinch на body, але SVG-фон і fixed
 *    елементи (glass-blob) лишаються zoomable у деяких WebKit-білдах.
 *
 * Що робить:
 *  1. touchmove з >1 пальцями → preventDefault → жест не починається
 *  2. gesturestart/gesturechange/gestureend (WebKit-only) → preventDefault
 *  3. Підключається синхронно при mount у layout.tsx, до перших interactivity.
 *
 * Не блокує: doubletap (за рідкісним winapp), wheel-zoom з Ctrl на desktop,
 * keyboard zoom. Це залишаємо для accessibility.
 */

'use client';

import { useEffect } from 'react';

export function ZoomGuard() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // 1. Multi-touch move — типовий початок pinch
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // 2. WebKit-only gesture events — додатковий захист на Safari
    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    // passive: false обов'язково — інакше preventDefault на touchmove ігнорується
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('gesturestart', handleGesture);
    document.addEventListener('gesturechange', handleGesture);
    document.addEventListener('gestureend', handleGesture);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('gesturestart', handleGesture);
      document.removeEventListener('gesturechange', handleGesture);
      document.removeEventListener('gestureend', handleGesture);
    };
  }, []);

  return null;
}
