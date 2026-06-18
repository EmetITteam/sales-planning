import type React from 'react';
import Link from 'next/link';
import { Users, AlertCircle, Search, UserPlus } from 'lucide-react';
import { UA_MONTHS } from '../client-helpers';

/**
 * <PageTitle> — заголовок сторінки «Клієнти» + secondary actions:
 *  - Рекламації (link на /claims, модуль Sprint 2B)
 *  - Пошук по всій базі (callback)
 *  - Новий клієнт (callback)
 *
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */
export function PageTitle({
  subtitle,
  onNewClient,
  onGlobalSearch,
}: {
  subtitle: React.ReactNode;
  onNewClient?: () => void;
  onGlobalSearch?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      <div className="w-10 h-10 rounded-xl bg-emet-blue text-white flex items-center justify-center shadow-[0_4px_12px_rgba(6,106,171,0.25)] shrink-0">
        <Users className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-[18px] font-bold tracking-tight">Клієнти</h1>
        <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</div>
      </div>
      <Link
        href="/claims"
        className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[34px] px-4 md:px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] md:text-[12px] font-bold hover:bg-rose-100 active:translate-y-px transition-all shrink-0"
        aria-label="Рекламації"
      >
        <AlertCircle className="w-4 h-4 md:w-3.5 md:h-3.5" />
        <span className="max-sm:hidden">Рекламації</span>
      </Link>
      {onGlobalSearch && (
        <button
          type="button"
          onClick={onGlobalSearch}
          className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[34px] px-4 md:px-3 rounded-xl bg-white/70 border border-emet-blue/25 text-emet-blue text-[13px] md:text-[12px] font-bold hover:bg-emet-blue hover:text-white hover:border-emet-blue active:translate-y-px transition-all shrink-0"
          aria-label="Пошук по всій базі"
        >
          <Search className="w-4 h-4 md:w-3.5 md:h-3.5" />
          <span className="max-sm:hidden">По всій базі</span>
        </button>
      )}
      {onNewClient && (
        <button
          type="button"
          onClick={onNewClient}
          className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[34px] px-4 md:px-3 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] md:text-[12px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.3)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.4)] active:translate-y-px transition-all shrink-0"
          aria-label="Новий клієнт"
        >
          <UserPlus className="w-4 h-4 md:w-3.5 md:h-3.5" />
          <span className="max-sm:hidden">Новий клієнт</span>
        </button>
      )}
    </div>
  );
}

/**
 * Helper для заголовка — кількість клієнтів + обраний місяць + live-індикатор.
 * Для поточного місяця показує live-точку + сьогоднішню дату.
 * Для архівних — просто "архівні дані".
 */
export function buildHeaderSubtitle(
  clientsCount: number,
  selectedMonth: string,
  isCurrentMonth: boolean,
): React.ReactNode {
  const [y, m] = selectedMonth.split('-').map(Number);
  const monthLabel = `${UA_MONTHS[m - 1]} ${y}`;
  const todayD = new Date();
  const today = `${String(todayD.getDate()).padStart(2, '0')}.${String(todayD.getMonth() + 1).padStart(2, '0')}.${todayD.getFullYear()}`;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span>{clientsCount} клієнтів · {monthLabel}</span>
      {isCurrentMonth ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981] animate-pulse" />
          live · станом на <span className="font-semibold tabular-nums">{today}</span>
        </span>
      ) : (
        <span className="text-[11px] text-slate-500">архівні дані</span>
      )}
    </span>
  );
}
