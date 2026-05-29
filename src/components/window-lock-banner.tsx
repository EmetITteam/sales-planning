'use client';

import { Lock, Wrench } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useWindowStatus } from '@/lib/use-window-status';

/**
 * Спільний банер блокування планування (Пакет А Етап 3, 2026-05-13).
 *
 * Логіка показу:
 *   - admin → ніколи (windowStatus.allowed=true завжди)
 *   - role='director' (Saша + Олійник-assistant через override) → ТІЛЬКИ
 *     якщо global-block (адмін вручну закрив усім «Технічні роботи»).
 *     Стандартне закриття window — нерелевантне Director-у, бо він
 *     read-only роль і не редагує плани.
 *   - role='manager' / 'rm' → показуємо щоразу коли заблоковано.
 *
 * Текст:
 *   - global-block → «Технічні роботи. Планування тимчасово закрите.»
 *     (Wrench-іконка, не Lock — щоб візуально відрізнити від планового
 *     закриття window).
 *   - інші reason → message з backend (опис правила що заблокувало).
 */
export function WindowLockBanner() {
  const { user, currentPeriod } = useAppStore();
  const { status } = useWindowStatus(
    currentPeriod?.month ?? null,
    user?.login ?? null,
  );

  if (!user || !status || status.allowed) return null;

  const isGlobalBlock = status.reason === 'global-block';
  const isDirectorOrAssistant = user.role === 'director';

  // Director / assistant бачать тільки global-block.
  if (isDirectorOrAssistant && !isGlobalBlock) return null;

  // Maintenance-style banner (global-block) — Wrench-іконка + amber:
  if (isGlobalBlock) {
    return (
      <div className="bg-amber-50/55 backdrop-blur-xl border border-amber-200/70 rounded-2xl p-4 flex items-start gap-3 shadow-[0_4px_20px_rgba(120,53,15,0.04)]">
        <div className="w-9 h-9 rounded-xl bg-amber-100/80 backdrop-blur-sm flex items-center justify-center shrink-0">
          <Wrench className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-amber-900">Технічні роботи</p>
          <p className="text-[13px] text-amber-800 mt-0.5">
            Планування тимчасово закрите. Доступ буде відновлено після завершення робіт.
          </p>
        </div>
      </div>
    );
  }

  // Стандартне window-закриття (тільки для manager/rm) — rose + Lock:
  return (
    <div className="bg-rose-50/55 backdrop-blur-xl border border-rose-200/70 rounded-2xl p-4 flex items-start gap-3 shadow-[0_4px_20px_rgba(159,18,57,0.04)]">
      <div className="w-9 h-9 rounded-xl bg-rose-100/80 backdrop-blur-sm flex items-center justify-center shrink-0">
        <Lock className="h-4 w-4 text-rose-700" />
      </div>
      <div className="flex-1">
        <p className="text-[14px] font-bold text-rose-900">Планування зараз закрите</p>
        <p className="text-[13px] text-rose-800 mt-0.5">{status.message}</p>
      </div>
    </div>
  );
}
