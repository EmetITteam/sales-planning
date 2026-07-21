'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { apiMe } from '@/lib/auth-client';

/**
 * SessionBootstrap — на mount читає /api/auth/me і populate-ить store.
 * Виконується один раз при першому render будь-якої сторінки (бо в root layout).
 *
 * Сторінки які залежать від сесії читають `bootstrapped` зі store щоб
 * відрізнити «ще завантажуємо» від «нема сесії».
 *
 * Плюс глобальний auth-guard: якщо після bootstrap користувача нема, а ми НЕ
 * на головній ('/') — редіректимо на '/'. Без цього під-сторінки (клієнти,
 * зустрічі, звіт, admin…) при логауті/протуханні сесії рендерять `null` →
 * ПУСТИЙ екран, з якого у PWA взагалі не вийти (немає адресного рядка).
 */
export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useAppStore(s => s.setUser);
  const setBootstrapped = useAppStore(s => s.setBootstrapped);
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    apiMe().then(u => {
      // ⚠️ ЗАВЖДИ викликаємо setUser, навіть з null. Інакше stale user зі
      // старого sessionStorage (від попередньої версії з persist user) лишається.
      setUser(u);
      setBootstrapped(true);
    });
  }, [setUser, setBootstrapped]);

  // Auth-guard: нема сесії і ми не на '/' → на login-екран (root показує LoginForm).
  useEffect(() => {
    if (bootstrapped && !user && pathname !== '/') {
      router.replace('/');
    }
  }, [bootstrapped, user, pathname, router]);

  return <>{children}</>;
}
