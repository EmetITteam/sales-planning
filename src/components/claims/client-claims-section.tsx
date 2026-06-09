'use client';

/**
 * ClientClaimsSection — список рекламацій конкретного клієнта.
 *
 * Використовується у розгорнутій картці клієнта (/clients ClientExpand).
 * Тягне всі рекламації менеджера через `/api/claims` (SWR з тим самим ключем
 * що `ClaimsList` — кешується разом, без додаткового round-trip), фільтрує
 * локально за client name.
 *
 * Якщо рекламацій по цьому клієнту немає — показуємо легкий empty-state,
 * не виносимо у noise. Якщо є — компактний список з лінками на /claims/[id].
 */

import Link from 'next/link';
import useSWR from 'swr';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { STATUS_LABELS, type ClaimStatus } from '@/lib/claims/constants';
import type { ClaimSummary } from '@/lib/claims/types';

const HEADERS_JSON = { 'Content-Type': 'application/json' };

const STATUS_DOT_COLORS: Record<ClaimStatus, string> = {
  new: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  resolved: 'bg-emerald-500',
  rejected: 'bg-rose-500',
};

const STATUS_TEXT_COLORS: Record<ClaimStatus, string> = {
  new: 'text-blue-700',
  in_progress: 'text-amber-700',
  resolved: 'text-emerald-700',
  rejected: 'text-rose-700',
};

interface Props {
  /** Display name клієнта — match по claim.client (title без «Рекламація:»). */
  clientName: string;
}

export function ClientClaimsSection({ clientName }: Props) {
  // Той самий SWR-ключ що у ClaimsList — кешуємо разом.
  const { data, isLoading } = useSWR<{ claims: ClaimSummary[] }>(
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

  const target = clientName.toLowerCase().trim();
  const myClaims = (data?.claims ?? []).filter(
    c => c.client.toLowerCase().trim() === target,
  );

  // Поки тягнеться список — рендеримо skeleton щоб blок не з'являвся стрибком.
  if (isLoading) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Рекламації клієнта
        </h3>
        <div className="glass-card-soft px-4 py-3 text-[12px] text-muted-foreground">
          Завантажую…
        </div>
      </div>
    );
  }

  // Якщо немає рекламацій по цьому клієнту — показуємо легкий empty-state
  // щоб менеджер бачив що блок існує і знав куди дивитись у майбутньому.
  if (myClaims.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Рекламації клієнта
        </h3>
        <div className="glass-card-soft px-4 py-2.5 text-[12px] text-muted-foreground italic">
          Немає рекламацій по цьому клієнту.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Рекламації клієнта · {myClaims.length}
      </h3>
      <div className="space-y-1.5">
        {myClaims.map(claim => (
          <Link
            key={claim.id}
            href={`/claims/${claim.id}`}
            className="glass-card-soft p-3 flex items-center gap-3 hover:bg-white/85 hover:border-emet-blue/25 transition-all group"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT_COLORS[claim.status]}`} />
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-muted-foreground">
                  #{claim.id}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${STATUS_TEXT_COLORS[claim.status]}`}
                >
                  {STATUS_LABELS[claim.status]}
                </span>
                <span className="text-[11px] text-muted-foreground/70">{claim.date}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-emet-blue transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
