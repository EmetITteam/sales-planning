'use client';

import { useEffect } from 'react';

/**
 * Setting --mouse-x / --mouse-y CSS variables on .glass-card elements
 * so the radial-gradient highlight follows the cursor (preview style).
 *
 * Реєструє один document-level listener — НЕ створює N-listenерів на N карток.
 * Активний лише поки компонент змонтований.
 */
export function useGlassHover() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const card = target.closest('.glass-card');
      if (!card || !(card instanceof HTMLElement)) return;
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mouse-x', `${x}%`);
      card.style.setProperty('--mouse-y', `${y}%`);
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, []);
}
