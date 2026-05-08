'use client';

/**
 * DEBUG: Action 4 (getRegistryPlans) — фільтр по managerLogin.
 *
 * Перевірка: чи має cross-region менеджер (Пашковская) плани у двох підрозділах?
 * Якщо Action 4 повертає для неї 2+ рядків з різними `divisionName` → 1С знає
 * про її подвійний регіон, але Action 5 цього не використовує.
 */

import { useState } from 'react';
import { callOneC } from '@/lib/onec-client';
import { useAppStore } from '@/lib/store';
import type { OneCRegistryPlan } from '@/lib/onec-types';

const DEFAULT_LOGIN = 'rm.odessa@emet.in.ua';

function fmt(v: number | string): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

export default function DebugRegistryPlansPage() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const [targetLogin, setTargetLogin] = useState(DEFAULT_LOGIN);
  const [allPlans, setAllPlans] = useState<OneCRegistryPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // YYYY-MM-01 / YYYY-MM-(last day)
  const [py, pm] = currentPeriod.month.split('-').map(Number);
  const dateFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
  const lastDay = new Date(py, pm, 0).getDate();
  const dateTo = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const handleFetch = async () => {
    if (!user) { setError('Спочатку залогінься'); return; }
    setLoading(true); setError(null); setAllPlans([]);
    try {
      const data = await callOneC('getRegistryPlans', { dateFrom, dateTo });
      setAllPlans(data.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const targetLower = targetLogin.toLowerCase().trim();
  const matchingPlans = allPlans.filter(p => (p.managerLogin || '').toLowerCase().trim() === targetLower);

  // Групуємо по divisionName щоб побачити скільки регіонів
  const byDivision = new Map<string, OneCRegistryPlan[]>();
  for (const p of matchingPlans) {
    const key = p.divisionName || '— без підрозділу —';
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key)!.push(p);
  }

  return (
    <div className="min-h-screen p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Debug: Action 4 (getRegistryPlans) — cross-region manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Перевіряємо чи 1С внутрішньо знає про подвійний регіон менеджера. Якщо
          Action 4 повертає для нього 2+ підрозділи — це доводить що Action 5 баг.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 space-y-2 border border-[#e2e7ef] text-sm">
        <p>Хто запитує: <span className="font-mono">{!bootstrapped ? '— перевіряю —' : user?.login || '— не залогінений —'}</span></p>
        <p>Період: <span className="font-mono">{dateFrom}{' / '}{dateTo}</span></p>
        <div className="flex items-center gap-2 mt-3">
          <label className="text-[13px]">Логін цільового менеджера:</label>
          <input
            type="text"
            value={targetLogin}
            onChange={e => setTargetLogin(e.target.value)}
            className="flex-1 max-w-md h-8 px-3 rounded-lg border border-[#e2e7ef] text-[12px] font-mono focus:outline-none focus:border-[#066aab]"
            placeholder="rm.odessa@emet.in.ua"
          />
        </div>
      </div>

      <button
        onClick={handleFetch}
        disabled={loading || !user}
        className="bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Запитую 1С…' : 'Запитати Action 4'}
      </button>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 font-mono whitespace-pre-wrap">{error}</div>
      )}

      {allPlans.length > 0 && (
        <>
          {/* TL;DR */}
          <div className={`rounded-2xl p-4 border-2 ${
            byDivision.size === 0
              ? 'bg-rose-50 border-rose-300'
              : byDivision.size === 1
              ? 'bg-amber-50 border-amber-300'
              : 'bg-emerald-50 border-emerald-300'
          }`}>
            <p className="text-[13px] font-bold">
              📊 Результат: <span className="font-mono">{targetLogin}</span> має плани у{' '}
              <b>{byDivision.size}</b> підрозділ{byDivision.size === 1 ? 'і' : 'ах'}
              {' '}({matchingPlans.length} рядк{matchingPlans.length === 1 ? '' : 'и'} плану)
            </p>
            {byDivision.size === 0 && <p className="text-[12px] mt-1">❌ Жодного плану. Перевір логін.</p>}
            {byDivision.size === 1 && (
              <p className="text-[12px] mt-1">⚠️ Тільки 1 підрозділ ({Array.from(byDivision.keys())[0]}). Якщо менеджер реально продає у двох регіонах — у 1С нема плану на другий регіон, або Action 4 теж відфільтровує.</p>
            )}
            {byDivision.size >= 2 && (
              <>
                <p className="text-[12px] mt-1">✅ Action 4 знає про подвійний регіон!</p>
                <p className="text-[12px] mt-1 font-bold">→ Питання до 1С: чому Action 5 повертає менеджера лише в одному регіоні якщо Action 4 повертає у двох?</p>
                <p className="text-[12px] mt-1">Підрозділи: <span className="font-mono">{Array.from(byDivision.keys()).join(', ')}</span></p>
              </>
            )}
          </div>

          {/* Деталізовано */}
          {matchingPlans.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#e2e7ef] overflow-hidden">
              <div className="px-4 py-2 border-b border-[#e2e7ef] bg-[#f4f7fb] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Плани {targetLogin} — групуємо по підрозділах
              </div>
              {Array.from(byDivision.entries()).map(([division, plans]) => {
                const sumPlan = plans.reduce((a, p) => a + parseFloat(String(p.planAmountUSD ?? '0') || '0'), 0);
                return (
                  <div key={division} className="border-t border-[#f0f2f8] p-4 space-y-2">
                    <p className="text-[13px] font-bold">
                      <span className="font-mono">{division}</span> — {plans.length} сегмент{plans.length === 1 ? '' : (plans.length < 5 ? 'и' : 'ів')}, sum plan = <span className="text-emerald-700">${fmt(sumPlan)}</span>
                    </p>
                    <table className="w-full text-[11px] mt-2">
                      <thead className="bg-[#f4f7fb] text-[10px] uppercase">
                        <tr>
                          <th className="px-2 py-1 text-left">Сегмент</th>
                          <th className="px-2 py-1 text-left">Назва</th>
                          <th className="px-2 py-1 text-right">PlanAmountUSD</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {plans.map((p, j) => (
                          <tr key={j} className="border-t border-[#f0f2f8]">
                            <td className="px-2 py-1 font-semibold">{p.segmentCode}</td>
                            <td className="px-2 py-1 font-sans">{p.segmentName}</td>
                            <td className="px-2 py-1 text-right">{fmt(p.planAmountUSD)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
