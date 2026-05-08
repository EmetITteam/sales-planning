'use client';

/**
 * DEBUG: тест Action 5 для конкретного логіну.
 *
 * Призначення: перевірити чи 1С повертає cross-region менеджера (як Пашковская)
 * у двох regions[] чи лише одному. По дефолту — Пашковская.
 *
 * Доступ: тільки залогіненим Director (бо ми викликаємо payload.login != session.login,
 * а у /api/onec такий override дозволений тільки для role=director).
 */

import { useState } from 'react';
import { callOneC } from '@/lib/onec-client';
import { useAppStore } from '@/lib/store';
import type { GetRegionDataResponse, OneCRegion, OneCRegionManager } from '@/lib/onec-types';

const DEFAULT_LOGIN = 'rm.odessa@emet.in.ua';

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

export default function DebugManagerRegionsPage() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const [targetLogin, setTargetLogin] = useState(DEFAULT_LOGIN);
  const [period, setPeriod] = useState(currentPeriod.month.slice(0, 7));
  const [response, setResponse] = useState<GetRegionDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!user) { setError('Спочатку залогінься (треба бути Director)'); return; }
    if (user.role !== 'director') {
      setError(`Ця сторінка доступна тільки Director. Твоя роль: ${user.role}.`);
      return;
    }
    setLoading(true); setError(null); setResponse(null);
    try {
      // ⚠️ ВАЖЛИВО: викликаємо з логіном ДИРЕКТОРА (поточної сесії), не цільового
      // менеджера. Тоді 1С повертає всі 8 регіонів з усіма менеджерами, і ми
      // шукаємо Пашковську у їх managers[]. Якщо передавати її login — 1С поверне
      // Action 5 «як для неї» (тільки її регіон як менеджер).
      const data = await callOneC('getRegionData', { login: user.login, period });
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Виборка записів конкретного менеджера у відповіді (для cross-region тесту)
  const matchingRecords: Array<{ region: OneCRegion; manager: OneCRegionManager }> = [];
  if (response) {
    const target = targetLogin.toLowerCase().trim();
    for (const reg of response.regions) {
      for (const m of reg.managers) {
        if ((m.managerLogin || '').toLowerCase().trim() === target) {
          matchingRecords.push({ region: reg, manager: m });
        }
      }
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Debug: cross-region manager test (Action 5)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Запитуємо Action 5 з payload.login = логін цільового менеджера. Перевіряємо
          скільки разів він з&apos;являється у regions[].managers[]. Якщо 2+ — 1С коректно
          ділить по підрозділах. Якщо 1 — bug Action 5 (втрачає cross-region частку).
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 space-y-2 border border-[#e2e7ef] text-sm">
        <p>Хто запитує: <span className="font-mono font-semibold">{!bootstrapped ? '— перевіряю —' : user?.login || '— не залогінений —'}</span> (роль: <b>{user?.role ?? '—'}</b>)</p>
        <div className="flex items-center gap-2 mt-3">
          <label className="text-[13px]">Період:</label>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="h-8 px-3 rounded-lg border border-[#e2e7ef] text-[12px] font-mono focus:outline-none focus:border-[#066aab]"
          />
        </div>
        <div className="flex items-center gap-2 mt-1">
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
        {loading ? 'Запитую 1С…' : `Запитати Action 5 для ${targetLogin}`}
      </button>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 font-mono whitespace-pre-wrap">{error}</div>
      )}

      {response && (
        <>
          {/* === TL;DR === */}
          <div className={`rounded-2xl p-4 border-2 ${
            matchingRecords.length === 0
              ? 'bg-rose-50 border-rose-300'
              : matchingRecords.length === 1
              ? 'bg-amber-50 border-amber-300'
              : 'bg-emerald-50 border-emerald-300'
          }`}>
            <p className="text-[13px] font-bold">
              📊 Результат: <span className="font-mono">{targetLogin}</span> з&apos;явилась у Action 5 — <b>{matchingRecords.length}</b> разів
            </p>
            {matchingRecords.length === 0 && <p className="text-[12px] mt-1">❌ 1С НЕ повернула менеджера взагалі. Перевір логін.</p>}
            {matchingRecords.length === 1 && (
              <p className="text-[12px] mt-1">⚠️ Тільки 1 запис (регіон <b>{matchingRecords[0].region.regionName || matchingRecords[0].region.regionCode}</b>). Якщо менеджер працює у двох регіонах — 1С Action 5 ВТРАЧАЄ другий регіон.</p>
            )}
            {matchingRecords.length >= 2 && (
              <p className="text-[12px] mt-1">✅ Action 5 повертає cross-region менеджера правильно. Регіони: {matchingRecords.map(r => r.region.regionName || r.region.regionCode).join(', ')}.</p>
            )}
          </div>

          {/* === Деталізовано по записах === */}
          {matchingRecords.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#e2e7ef] overflow-hidden">
              <div className="px-4 py-2 border-b border-[#e2e7ef] bg-[#f4f7fb] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Записи у regions[].managers[]
              </div>
              {matchingRecords.map(({ region, manager }, i) => (
                <div key={i} className="border-t border-[#f0f2f8] p-4 space-y-2">
                  <p className="text-[13px] font-bold">
                    Запис {i + 1}: regions[<span className="font-mono">{region.regionName}</span> / <span className="font-mono">{region.regionCode}</span>]
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-[12px]">
                    <div className="bg-[#f4f7fb] rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">totalPlan</p>
                      <p className="font-bold font-mono">{fmt(manager.totalPlan)}</p>
                    </div>
                    <div className="bg-[#f4f7fb] rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">totalFact</p>
                      <p className="font-bold font-mono">{fmt(manager.totalFact)}</p>
                    </div>
                    <div className="bg-[#f4f7fb] rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">totalPrevMonthFact</p>
                      <p className="font-bold font-mono">{fmt(manager.totalPrevMonthFact)}</p>
                    </div>
                  </div>
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">segments[] ({manager.segments.length})</summary>
                    <table className="w-full mt-2 text-[11px]">
                      <thead className="bg-[#f4f7fb] text-[10px] uppercase">
                        <tr>
                          <th className="px-2 py-1 text-left">Сегмент</th>
                          <th className="px-2 py-1 text-right">Plan</th>
                          <th className="px-2 py-1 text-right">Fact</th>
                          <th className="px-2 py-1 text-right">PrevFact</th>
                          <th className="px-2 py-1 text-right">PrevPlan</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {manager.segments.map((s, j) => (
                          <tr key={j} className="border-t border-[#f0f2f8]">
                            <td className="px-2 py-1 font-semibold">{s.segmentCode}</td>
                            <td className="px-2 py-1 text-right">{fmt(s.planAmountUSD)}</td>
                            <td className="px-2 py-1 text-right">{fmt(s.factAmountUSD)}</td>
                            <td className="px-2 py-1 text-right">{fmt(s.prevMonthFactUSD)}</td>
                            <td className="px-2 py-1 text-right">{fmt(s.prevMonthPlanUSD)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </div>
              ))}
            </div>
          )}

          {/* === RAW JSON для копіювання === */}
          <details className="bg-white rounded-2xl border border-[#e2e7ef] p-3">
            <summary className="cursor-pointer text-[12px] font-semibold">Raw JSON відповіді Action 5 (regions: {response.regions.length})</summary>
            <pre className="mt-3 text-[10px] font-mono overflow-x-auto whitespace-pre bg-[#fafbfe] p-3 rounded">
              {JSON.stringify(response, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
