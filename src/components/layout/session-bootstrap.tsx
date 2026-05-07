'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiMe } from '@/lib/auth-client';

/**
 * SessionBootstrap — на mount читає /api/auth/me і populate-ить store.
 * Виконується один раз при першому render будь-якої сторінки (бо в root layout).
 *
 * Сторінки які залежать від сесії читають `bootstrapped` зі store щоб
 * відрізнити «ще завантажуємо» від «нема сесії».
 */
export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useAppStore(s => s.setUser);
  const setBootstrapped = useAppStore(s => s.setBootstrapped);

  useEffect(() => {
    apiMe().then(u => {
      // ⚠️ ЗАВЖДИ викликаємо setUser, навіть з null. Інакше stale user зі
      // старого sessionStorage (від попередньої версії з persist user) лишається.
      setUser(u);
      setBootstrapped(true);
    });
  }, [setUser, setBootstrapped]);

  return <>{children}</>;
}
