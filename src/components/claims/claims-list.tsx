'use client';

/**
 * ClaimsList — головний компонент сторінки `/claims`.
 *
 * Pull з Bitrix через SWR (revalidate-on-focus + dedupe). Filter по статусу +
 * пошук по client/title. Кнопка «Нова рекламація» відкриває ClaimFormDialog.
 *
 * Карточки клікабельні → /claims/[id] (Sprint B.5).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertCircle,
  Plus,
  Search,
  Loader2,
  Inbox,
  MessageCircle,
} from 'lucide-react';
import { ClaimFormDialog } from './claim-form-dialog';
import { STATUS_LABELS, type ClaimStatus } from '@/lib/claims/constants';
import type { ClaimSummary } from '@/lib/claims/types';

const HEADERS_JSON = { 'Content-Type': 'application/json' };

/** Кольорова палітра статусів для бейджів. */
const STATUS_COLORS: Record<ClaimStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_DOTS: Record<ClaimStatus, string> = {
  new: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  resolved: 'bg-emerald-500',
  rejected: 'bg-rose-500',
};

/** Glass-tint картки по статусу — однакова стилістика з MeetingCard:
 *  легкий gradient від status-color → white/60, прозорий border. */
const STATUS_CARD_BG: Record<ClaimStatus, string> = {
  new: 'bg-gradient-to-br from-blue-100/40 to-white/60 border-blue-200/60',
  in_progress: 'bg-gradient-to-br from-amber-100/40 to-white/60 border-amber-200/60',
  resolved: 'bg-gradient-to-br from-teal-100/30 to-white/60 border-teal-100/70',
  rejected: 'bg-gradient-to-br from-rose-100/35 to-white/60 border-rose-200/60',
};

type StatusFilter = 'all' | 'unread' | ClaimStatus;

export function ClaimsList() {
  const { data, error, isLoading, mutate } = useSWR<{ claims: ClaimSummary[] }>(
    'claims-list',
    async () => {
      const r = await fetch('/api/claims', {
        credentials: 'same-origin',
        headers: HEADERS_JSON,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    { revalidateOnFocus: true, dedupingInterval: 15_000 },
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const claims = data?.claims ?? [];
  const counts = useMemo(() => {
    const c = { all: claims.length, new: 0, in_progress: 0, resolved: 0, rejected: 0 };
    for (const cl of claims) c[cl.status]++;
    return c;
  }, [claims]);
  const unreadCount = useMemo(
    () => claims.filter(c => c.hasUnread).length,
    [claims],
  );

  const filtered = useMemo(() => {
    let list = claims;
    if (statusFilter === 'unread') {
      list = list.filter(c => c.hasUnread);
    } else if (statusFilter !== 'all') {
      list = list.filter(c => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        c => c.client.toLowerCase().includes(q) || String(c.id).includes(q),
      );
    }
    return list;
  }, [claims, statusFilter, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-sm">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-bold tracking-tight text-emet-ink">Рекламації</h1>
          <p className="text-[12px] text-muted-foreground">
            {counts.all === 0
              ? 'У вас ще немає створених рекламацій'
              : `${counts.all} ${pluralUA(counts.all, 'рекламація', 'рекламації', 'рекламацій')}`}
            {counts.new > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-blue-700">{counts.new} нових</span>
              </>
            )}
            {unreadCount > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => setStatusFilter('unread')}
                  className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:text-rose-800 underline decoration-rose-300 hover:decoration-rose-600 transition-colors"
                  title="Показати тільки рекламації з непрочитаними"
                >
                  <MessageCircle className="w-3 h-3" />
                  {unreadCount} {pluralUA(unreadCount, 'нове повідомлення', 'нові повідомлення', 'нових повідомлень')}
                </button>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-1.5 h-10 px-3 md:px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] md:text-[14px] font-bold shadow-md hover:shadow-lg transition-shadow"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Нова рекламація</span>
          <span className="sm:hidden">Нова</span>
        </button>
      </div>

      {/* Filters + search */}
      <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-3 md:p-4 space-y-3 shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук за клієнтом або #номером…"
            className="w-full h-10 pl-9 pr-3 rounded-[10px] border border-slate-200 bg-white/85 text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterPill
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            count={counts.all}
          >
            Усі
          </FilterPill>
          {unreadCount > 0 && (
            <FilterPill
              active={statusFilter === 'unread'}
              onClick={() => setStatusFilter('unread')}
              count={unreadCount}
              tone="rose"
            >
              Непрочитані
            </FilterPill>
          )}
          {(['new', 'in_progress', 'resolved', 'rejected'] as ClaimStatus[]).map(s =>
            counts[s] > 0 ? (
              <FilterPill
                key={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                count={counts[s]}
              >
                {STATUS_LABELS[s]}
              </FilterPill>
            ) : null,
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Завантажую…
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-[13px] text-rose-700">
          <div className="font-semibold mb-1">Не вдалось завантажити рекламації</div>
          <div className="text-[12px]">{(error as Error).message}</div>
          <button
            onClick={() => mutate()}
            className="mt-2 text-[12px] underline text-rose-700"
          >
            Спробувати знову
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-8 text-center space-y-2 shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground">
            {claims.length === 0
              ? 'Поки що немає створених рекламацій. Натисніть «Нова рекламація» щоб подати першу.'
              : 'Нічого не знайдено за обраним фільтром'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(claim => {
            // Збираємо meta-рядок: дата · тип скарги · препарат (без порожніх).
            const meta = [claim.date, claim.claimType, claim.product]
              .filter(Boolean)
              .join(' · ');
            return (
              <Link
                key={claim.id}
                href={`/claims/${claim.id}`}
                className={`relative block ${STATUS_CARD_BG[claim.status]} backdrop-blur-xl backdrop-saturate-150 border rounded-2xl p-3.5 md:p-4 shadow-[0_4px_14px_rgba(6,42,61,0.04)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(6,42,61,0.08)] hover:border-emet-blue/30`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${STATUS_DOTS[claim.status]}`} />
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                    {/* Зліва — eyebrow «Рекламація #N» + клієнт + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.7px] text-muted-foreground mb-0.5">
                        Рекламація <span className="font-mono tabular-nums">#{claim.id}</span>
                      </div>
                      <div className="text-[14px] font-semibold text-emet-ink truncate">
                        {claim.client}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate tabular-nums">
                        {meta || claim.date}
                      </div>
                    </div>
                    {/* Справа — статусні чипи */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[55%]">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-[0.6px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[claim.status]}`}
                      >
                        {STATUS_LABELS[claim.status]}
                      </span>
                      {claim.hasUnread && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.6px] px-2 py-0.5 rounded-full bg-rose-500 text-white shadow-sm">
                          <MessageCircle className="w-2.5 h-2.5" />
                          Нове
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ClaimFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          // Через 2.5с модалка сама закриється — тоді оновлюємо список.
          setTimeout(() => mutate(), 2600);
        }}
      />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  count,
  children,
  tone = 'blue',
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  tone?: 'blue' | 'rose';
}) {
  const activeClass =
    tone === 'rose'
      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
      : 'bg-emet-blue text-white border-emet-blue shadow-sm';
  const hoverClass =
    tone === 'rose'
      ? 'bg-white text-rose-700 border-rose-200 hover:border-rose-400 hover:text-rose-700'
      : 'bg-white text-slate-700 border-slate-200 hover:border-emet-blue hover:text-emet-blue';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold transition-all border ${
        active ? activeClass : hoverClass
      }`}
    >
      <span>{children}</span>
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full tabular-nums ${
          active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** Українські plural-форми (n форм 1/2-4/5+) */
function pluralUA(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
