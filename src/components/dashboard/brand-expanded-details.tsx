'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Users, UserPlus, RefreshCw, Sparkles, Loader2 } from 'lucide-react';
import { formatUSD } from '@/lib/format';
import { loadPlanning } from '@/lib/api';
import { adaptClientsForPlanning } from '@/lib/onec-adapters';
import {
  getUnplannedBuyersForSegment, groupUnplannedByCategory,
} from '@/lib/unplanned-buyers';
import { isPassiveAmount } from '@/lib/passive-rows';
import type { GetClientsForPlanningResponse } from '@/lib/onec-types';
import type { SalesFactResponse, Client1C } from '@/lib/types';

interface Props {
  login: string;
  segmentCode: string;
  segmentName: string;
  periodId: number;
  clientsResponse: GetClientsForPlanningResponse | null;
  factResponse: SalesFactResponse | null;
  /** Перейти у форму планування */
  onPlan: () => void;
}

/**
 * Variant A (Sasha 2026-05-06): expanded breakdown під BrandRow.
 *
 * Показує:
 *  - 3 базові категорії: Активні / Нові / Активація — куплено / у плані
 *  - «Незаплановані» — клієнти що купили без плану, з розбивкою по 5 під-категоріях
 *
 * Lazy-load плану з Supabase (на dashboard ми його не тримаємо, бо завдання
 * дашборда — звести метрики, а план зберігаємо у формі). SWR кеш робить
 * повторне відкриття того самого бренду миттєвим.
 */
export function BrandExpandedDetails({
  login, segmentCode, segmentName, periodId,
  clientsResponse, factResponse, onPlan,
}: Props) {
  // SWR кешує per (login, segmentCode, periodId) — дедуп при повторному
  // розкритті/закритті бренду + spawn fetch тільки раз. 5хв TTL — план
  // у Supabase не змінюється сам по собі, тільки через save цього самого юзера.
  const swrKey = login && segmentCode && periodId
    ? ['planning', login, segmentCode, periodId] as const
    : null;
  const { data: plan, isLoading: planLoading } = useSWR(
    swrKey,
    ([, l, s, p]) => loadPlanning(l, s, p),
    { dedupingInterval: 300_000, revalidateOnFocus: false },
  );

  const allClients: Client1C[] = useMemo(
    () => clientsResponse ? adaptClientsForPlanning(clientsResponse) : [],
    [clientsResponse],
  );

  // Хто у плані менеджера для цього сегменту (forecasts ∪ gapClosures).
  // ⚠️ Passive rows (amount=0) НЕ потрапляють у Set — це означає що клієнт
  // з фактом > 0 на amount=0 рядку коректно виплигне у блок «Незаплановані».
  const plannedIds = useMemo(() => {
    if (!plan) return new Set<string>();
    const set = new Set<string>();
    for (const f of plan.forecasts) {
      if (f.client_id_1c && !isPassiveAmount(f.forecast_amount)) set.add(f.client_id_1c);
    }
    for (const g of plan.gapClosures) {
      if (g.client_id_1c && !isPassiveAmount(g.potential_amount)) set.add(g.client_id_1c);
    }
    return set;
  }, [plan]);

  const unplanned = useMemo(
    () => getUnplannedBuyersForSegment(allClients, factResponse, segmentCode, plannedIds),
    [allClients, factResponse, segmentCode, plannedIds],
  );
  const unplannedByCat = useMemo(() => groupUnplannedByCategory(unplanned), [unplanned]);

  // Хто купив цей сегмент за категоріями — ТІЛЬКИ ті що БУЛИ В ПЛАНІ (planned&bought).
  // Інакше один клієнт показався б одночасно у "Активні: bought=1" І "Незаплановані: 1"
  // — двічі для тієї ж людини.
  const factSegment = factResponse?.facts.find(f => f.segmentCode === segmentCode);
  const buyersByCategory = useMemo(() => {
    const map = new Map<string, Client1C['category']>();
    for (const c of allClients) map.set(c.clientId, c.category);
    const out = { active: 0, new: 0, sleeping_lost: 0 };
    if (!factSegment) return out;
    for (const buyer of factSegment.clients) {
      if (buyer.amount <= 0) continue;
      if (!plannedIds.has(buyer.clientId)) continue; // skip unplanned — вони у блоці Незаплановані
      const cat = map.get(buyer.clientId) ?? 'none';
      if (cat === 'active') out.active += 1;
      else if (cat === 'new') out.new += 1;
      else if (cat === 'sleeping' || cat === 'lost' || cat === 'none') out.sleeping_lost += 1;
    }
    return out;
  }, [factSegment, allClients, plannedIds]);

  const factByCategory = useMemo(() => {
    const map = new Map<string, Client1C['category']>();
    for (const c of allClients) map.set(c.clientId, c.category);
    const out = { active: 0, new: 0, sleeping_lost: 0 };
    if (!factSegment) return out;
    for (const buyer of factSegment.clients) {
      if (!plannedIds.has(buyer.clientId)) continue; // skip unplanned — їх fact у блоці Незаплановані
      const cat = map.get(buyer.clientId) ?? 'none';
      if (cat === 'active') out.active += buyer.amount;
      else if (cat === 'new') out.new += buyer.amount;
      else out.sleeping_lost += buyer.amount;
    }
    return out;
  }, [factSegment, allClients, plannedIds]);

  // Скільки в плані менеджера у цій категорії.
  // ⚠️ Passive рядки (amount=0) НЕ враховуємо — це «пам'ятаю, не планую».
  const plannedByCategory = useMemo(() => {
    const map = new Map<string, Client1C['category']>();
    for (const c of allClients) map.set(c.clientId, c.category);
    const out = { active: 0, new: 0, sleeping_lost: 0 };
    if (!plan) return out;
    const seen = new Set<string>();
    const tally = (clientId: string) => {
      if (seen.has(clientId)) return;
      seen.add(clientId);
      const cat = map.get(clientId) ?? 'none';
      if (cat === 'active') out.active += 1;
      else if (cat === 'new') out.new += 1;
      else out.sleeping_lost += 1;
    };
    for (const f of plan.forecasts) {
      if (f.client_id_1c && !isPassiveAmount(f.forecast_amount)) tally(f.client_id_1c);
    }
    for (const g of plan.gapClosures) {
      if (g.client_id_1c && !isPassiveAmount(g.potential_amount)) tally(g.client_id_1c);
    }
    return out;
  }, [plan, allClients]);

  const unplannedTotalFact = unplanned.reduce((s, b) => s + b.factAmount, 0);

  const baseCards = [
    { key: 'active' as const, label: 'Активні', icon: Users, color: 'text-emerald-700', bg: 'bg-emerald-50', planned: plannedByCategory.active, bought: buyersByCategory.active, fact: factByCategory.active },
    { key: 'new' as const, label: 'Нові', icon: UserPlus, color: 'text-[#066aab]', bg: 'bg-blue-50', planned: plannedByCategory.new, bought: buyersByCategory.new, fact: factByCategory.new },
    { key: 'sleeping_lost' as const, label: 'Активація', icon: RefreshCw, color: 'text-amber-700', bg: 'bg-amber-50', planned: plannedByCategory.sleeping_lost, bought: buyersByCategory.sleeping_lost, fact: factByCategory.sleeping_lost },
  ];

  const subCats: Array<[string, typeof unplannedByCat.active]> = [
    ['Активний', unplannedByCat.active],
    ['Сплячий', unplannedByCat.sleeping],
    ['Втрачений', unplannedByCat.lost],
    ['Новий', unplannedByCat.new],
    ['Без закупок', unplannedByCat.none],
  ];

  return (
    <div className="bg-slate-50/60 rounded-2xl border border-[#e8ebf4] px-4 py-3 mt-1">
      {planLoading ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Завантажую план для {segmentName}…
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Розклад по сегментах клієнтів
            </p>
            <button
              onClick={onPlan}
              className="text-[11px] font-semibold text-[#066aab] hover:underline"
            >
              Перейти у форму →
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {baseCards.map(c => (
              <div key={c.key} className="bg-white rounded-xl p-3 border border-slate-100">
                <div className={`flex items-center gap-2 mb-2 ${c.color}`}>
                  <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
                    <c.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[12px] font-semibold">{c.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Куп./План</p>
                    <p className="text-[14px] font-bold">{c.bought}/{c.planned}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Факт</p>
                    <p className="text-[12px] font-bold amount text-emerald-700">{formatUSD(c.fact)}</p>
                  </div>
                </div>
              </div>
            ))}
            {/* Незаплановані — окрема картка з розбивкою */}
            <div className="bg-white rounded-xl p-3 border border-fuchsia-100">
              <div className="flex items-center gap-2 mb-2 text-fuchsia-700">
                <div className="w-7 h-7 rounded-lg bg-fuchsia-50 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="text-[12px] font-semibold">Незаплановані</span>
              </div>
              {unplanned.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Немає — всі покупці у плані.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Купили</p>
                      <p className="text-[14px] font-bold">{unplanned.length}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Факт</p>
                      <p className="text-[12px] font-bold amount text-fuchsia-700">{formatUSD(unplannedTotalFact)}</p>
                    </div>
                  </div>
                  <div className="space-y-0.5 pt-1.5 border-t border-fuchsia-100/60">
                    {subCats.filter(([, items]) => items.length > 0).map(([label, items]) => {
                      const sum = items.reduce((s, b) => s + b.factAmount, 0);
                      return (
                        <div key={label} className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">↳ {label}</span>
                          <span className="font-semibold">
                            {items.length} · <span className="amount">{formatUSD(sum)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
