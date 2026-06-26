'use client';

/**
 * /system-locked — сторінка куди перекидає активних користувачів коли система
 * блокується посеред їх сесії (вони отримали 503 SYSTEM_LOCKED від /api/onec).
 *
 * Дві ситуації:
 *   1. Менеджер залогінений → admin вмикає kill-switch → наступний API call повертає 503
 *      → клієнтський SWR/fetch interceptor (apiLogin/auth-client) тригерить редирект сюди.
 *   2. Хтось вручну зайшов на URL /system-locked — бачить ту ж саму сторінку.
 *
 * Стан перевіряємо при mount + кнопка «Спробувати знову» — fetch /api/system-status.
 * Якщо вже unlocked — редирект на /.
 *
 * Створено 2026-06-26.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, RefreshCw, LogIn } from 'lucide-react';

export default function SystemLockedPage() {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [stillLocked, setStillLocked] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try {
      const r = await fetch('/api/system-status', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) {
        // 401 → треба перелогінитись (cookie протерміновано) → на /
        if (r.status === 401) {
          router.replace('/');
          return;
        }
        return;
      }
      const body = await r.json() as { locked: boolean; reason: string | null };
      setReason(body.reason);
      setStillLocked(body.locked);
      // Якщо розблоковано — повертаємо на корінь.
      if (!body.locked) {
        router.replace('/');
      }
    } catch {/* fail-silent */}
    finally {
      setChecking(false);
      setCheckedOnce(true);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-rose-50 p-4">
      <div className="fixed top-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-rose-100/40 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-150px] left-[-100px] w-[400px] h-[400px] rounded-full bg-rose-100/40 blur-3xl pointer-events-none" />

      <div className="w-full max-w-[440px] relative">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-rose-700 to-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-500/30 mb-4">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-rose-900">
            Система на обслуговуванні
          </h1>
          <p className="text-[13px] text-rose-700/80 mt-2">
            Доступ тимчасово обмежений
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-rose-500/10 border border-rose-200/60 p-6 space-y-5">
          {reason ? (
            <div className="px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200/60">
              <p className="text-[11px] uppercase tracking-wider font-bold text-rose-700">Причина</p>
              <p className="text-[13px] text-rose-900 mt-1">{reason}</p>
            </div>
          ) : (
            checkedOnce && (
              <p className="text-[13px] text-muted-foreground text-center">
                Звичайно це триває кілька хвилин. Спробуйте оновити сторінку трохи пізніше.
              </p>
            )
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={refresh}
              disabled={checking}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] font-bold shadow-md hover:shadow-lg active:translate-y-px transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Перевіряю…' : 'Спробувати знову'}
            </button>

            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[13px] font-semibold text-slate-700 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              На сторінку входу
            </button>
          </div>

          {!stillLocked && checkedOnce && (
            <p className="text-[12px] text-emerald-700 text-center font-semibold">
              ✓ Система знов доступна. Повертаю…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
