'use client';

import { useEffect } from 'react';
import { useAppStore } from './store';
import { useOneCData } from './use-onec-data';

/**
 * Кешований хук для `getClientsForPlanning`.
 *
 * Ідея: 564+ клієнтів менеджера змінюються рідко (раз-два на місяць),
 * але метод викликається в багатьох місцях: дашборд + кожен бренд.
 * Тому кешуємо результат у Zustand store per-login, в пам'яті.
 *
 * Поведінка:
 *  - Перший виклик з логіном → fetch до 1С (1-3с) → запис в кеш
 *  - Наступні виклики з тим же логіном → миттєво, без мережі
 *  - login=null/'anonymous' → не fetch, повертає null
 *  - refetch() → інвалідує кеш для логіну і викликає 1С знов
 *
 * Кеш живе до закриття вкладки (НЕ persistимо у storage — щоб не тримати
 * 564 клієнтів у sessionStorage).
 */
export function useClientsForPlanning(login: string | null) {
  const cached = useAppStore(s => login ? s.clientsByLogin[login] : undefined);
  const setCache = useAppStore(s => s.setClientsForLogin);

  const shouldFetch = !!login && login !== 'anonymous' && !cached;
  const { data, loading, error, refetch: refetchInner } = useOneCData(
    'getClientsForPlanning',
    shouldFetch ? { login: login! } : null,
  );

  // Записуємо в кеш як тільки 1С відповіла
  useEffect(() => {
    if (data && login) setCache(login, data);
  }, [data, login, setCache]);

  return {
    data: cached ?? data,
    loading: shouldFetch ? loading : false,
    error,
    refetch: () => {
      if (login) setCache(login, undefined);
      refetchInner();
    },
  };
}
