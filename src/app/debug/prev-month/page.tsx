'use client';

/**
 * DEBUG: per-manager totalPrevMonthFact з Action 5.
 *
 * Призначення: знайти причину розходження між нашим агрегатом і 1С звітом
 * план-факт. Показуємо кожного менеджера з:
 *   - totalPrevMonthFact (як 1С прислала у Action 5)
 *   - Сума його segments[].prevMonthFactUSD
 *   - Різниця (має бути 0 — інакше у 1С Action 5 баг)
 *
 * Користувач порівнює з 1С звітом і знаходить рядок де $2,908 «загубились».
 *
 * Видалити цю сторінку після з'ясування.
 */

import { useState } from 'react';
import { callOneC } from '@/lib/onec-client';
import { useAppStore } from '@/lib/store';
import { adaptRegionData } from '@/lib/onec-adapters';

interface Row {
  region: string;
  regionCode: string;
  managerName: string;
  managerLogin: string;
  totalPrevMonthFact: number;
  segmentsSum: number;
  diff: number;
  /** Чи менеджер пройшов фільтр active (зараз показується у дашбордах). */
  isActive: boolean;
}

function formatNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DebugPrevMonthPage() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rawTotal, setRawTotal] = useState<number | null>(null);

  const handleFetch = async () => {
    if (!user) { setError('Спочатку залогінься'); return; }
    setLoading(true); setError(null); setRows([]);
    try {
      const period = currentPeriod.month.slice(0, 7);
      const raw = await callOneC('getRegionData', { login: user.login, period });
      const adapted = adaptRegionData(raw);

      // Будуємо список з RAW даних (без нашого фільтра!) — щоб бачити всіх включно з відфільтрованими.
      const out: Row[] = [];
      for (const reg of raw.regions) {
        // Розшифрувати swap (якщо 1С знов раптом переплутає поля)
        const isSwapped = /^[A-Z]{2,5}$/.test(reg.regionName) && /[А-Яа-яіїєґІЇЄҐ]/.test(reg.regionCode);
        const realName = isSwapped ? reg.regionCode : reg.regionName;
        const realCode = isSwapped ? reg.regionName : reg.regionCode;
        const activeRegion = adapted.regions.find(r => r.regionCode === (realCode || realName));

        for (const m of reg.managers) {
          const segSum = m.segments.reduce((a, s) => {
            const v = typeof s.prevMonthFactUSD === 'number' ? s.prevMonthFactUSD : parseFloat(String(s.prevMonthFactUSD ?? '0'));
            return a + (Number.isFinite(v) ? v : 0);
          }, 0);
          const totalRaw = typeof m.totalPrevMonthFact === 'number'
            ? m.totalPrevMonthFact
            : parseFloat(String(m.totalPrevMonthFact ?? '0'));
          const total = Number.isFinite(totalRaw) ? totalRaw : 0;
          const isActive = !!activeRegion?.managers.find(x => x.login === (m.managerLogin || '').toLowerCase().trim());
          out.push({
            region: realName,
            regionCode: realCode,
            managerName: m.managerName,
            managerLogin: m.managerLogin,
            totalPrevMonthFact: total,
            segmentsSum: segSum,
            diff: total - segSum,
            isActive,
          });
        }
      }

      // Сортуємо: спочатку active, потім за регіоном, потім за менеджером
      out.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const r = a.region.localeCompare(b.region, 'uk');
        return r !== 0 ? r : a.managerName.localeCompare(b.managerName, 'uk');
      });

      setRows(out);
      // Раховуємо повну суму з RAW (без фільтра) — щоб порівняти з 1С звітом
      setRawTotal(out.reduce((a, r) => a + r.totalPrevMonthFact, 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const activeRows = rows.filter(r => r.isActive);
  const inactiveRows = rows.filter(r => !r.isActive);
  const activeSum = activeRows.reduce((a, r) => a + r.totalPrevMonthFact, 0);
  const inactiveSum = inactiveRows.reduce((a, r) => a + r.totalPrevMonthFact, 0);

  return (
    <div className="min-h-screen p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Debug: prev-month per manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Шукаємо хто з менеджерів у 1С Action 5 повертає менше ніж у звіті план-факт.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 space-y-1 border border-[#e2e7ef] text-sm">
        <p>Логін: <span className="font-mono font-semibold">{!bootstrapped ? '— перевіряю —' : user?.login || '— не залогінений —'}</span></p>
        <p>Період: <span className="font-mono font-semibold">{currentPeriod.month.slice(0, 7)}</span></p>
      </div>

      <button
        onClick={handleFetch}
        disabled={loading || !user}
        className="bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Запитую 1С…' : 'Запитати Action 5'}
      </button>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 font-mono whitespace-pre-wrap">{error}</div>
      )}

      {rows.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border border-[#e2e7ef] overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-[#f4f7fb] text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Регіон</th>
                  <th className="px-3 py-2 text-left">Менеджер</th>
                  <th className="px-3 py-2 text-left">Логін</th>
                  <th className="px-3 py-2 text-right">totalPrevMonthFact (1С)</th>
                  <th className="px-3 py-2 text-right">Σ segments.prevMonth</th>
                  <th className="px-3 py-2 text-right">diff</th>
                  <th className="px-3 py-2 text-center">У дашборді?</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-[#f0f2f8] ${!r.isActive ? 'opacity-50 bg-rose-50/30' : ''}`}>
                    <td className="px-3 py-2">{r.region}</td>
                    <td className="px-3 py-2 font-sans">{r.managerName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.managerLogin}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatNum(r.totalPrevMonthFact)}</td>
                    <td className="px-3 py-2 text-right">{formatNum(r.segmentsSum)}</td>
                    <td className={`px-3 py-2 text-right ${Math.abs(r.diff) > 0.01 ? 'text-rose-600 font-bold' : 'text-muted-foreground/40'}`}>
                      {Math.abs(r.diff) > 0.01 ? formatNum(r.diff) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">{r.isActive ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#f4f7fb] font-bold">
                <tr className="border-t-2 border-[#066aab]/20">
                  <td colSpan={3} className="px-3 py-2">TOTAL у дашборді (active)</td>
                  <td className="px-3 py-2 text-right text-[#066aab]">{formatNum(activeSum)}</td>
                  <td colSpan={3} />
                </tr>
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-muted-foreground">+ filtered out (не у дашборді)</td>
                  <td className="px-3 py-2 text-right text-rose-600">{formatNum(inactiveSum)}</td>
                  <td colSpan={3} />
                </tr>
                <tr>
                  <td colSpan={3} className="px-3 py-2">TOTAL з усіх menагерів raw Action 5</td>
                  <td className="px-3 py-2 text-right">{rawTotal !== null ? formatNum(rawTotal) : ''}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[12px] text-amber-800 space-y-1">
            <p className="font-semibold">Як читати:</p>
            <p>• <b>diff &gt; 0</b> у рядку — 1С повернула totalPrevMonthFact більше за суму segments → є позасегментні продажі (не у наших 9 брендах).</p>
            <p>• <b>diff &lt; 0</b> — totalPrevMonthFact менше за суму → дивна ситуація, 1С повертає неузгоджені поля.</p>
            <p>• <b>❌ у колонці «У дашборді»</b> — менеджер відфільтрований нашим фільтром (архівний регіон, або всі поля = 0). Його сума не входить у дашбордне TOTAL але має бути у звіті 1С.</p>
            <p>• Шукаємо рядок або кілька де сума різниці = $2,908 (та що бракує у дашборді).</p>
          </div>
        </>
      )}
    </div>
  );
}
