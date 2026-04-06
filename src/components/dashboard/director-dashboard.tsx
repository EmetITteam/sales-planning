'use client';

import { formatUSD, getTrafficLight } from '@/lib/format';
import { MOCK_ALL_REGIONS, SEGMENTS } from '@/lib/mock-data';
import { Target, DollarSign, TrendingUp, MapPin, Users, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export function DirectorDashboard() {
  const regions = MOCK_ALL_REGIONS;

  const regionSummaries = regions.map(region => {
    let totalPlan = 0, totalFact = 0;
    const segTotals: Record<string, { plan: number; fact: number }> = {};
    SEGMENTS.forEach(seg => { segTotals[seg.code] = { plan: 0, fact: 0 }; });
    region.managers.forEach(m => {
      m.segments.forEach(s => {
        totalPlan += s.planAmount;
        totalFact += s.factAmount;
        if (segTotals[s.segmentCode]) {
          segTotals[s.segmentCode].plan += s.planAmount;
          segTotals[s.segmentCode].fact += s.factAmount;
        }
      });
    });
    return { ...region, totalPlan, totalFact, pct: totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0, segTotals };
  });

  const grandPlan = regionSummaries.reduce((s, r) => s + r.totalPlan, 0);
  const grandFact = regionSummaries.reduce((s, r) => s + r.totalFact, 0);
  const grandPct = grandPlan > 0 ? (grandFact / grandPlan) * 100 : 0;
  const totalManagers = regions.reduce((s, r) => s + r.managers.length, 0);

  const segGrandTotals = SEGMENTS.map(seg => {
    let plan = 0, fact = 0;
    regionSummaries.forEach(r => { plan += r.segTotals[seg.code]?.plan ?? 0; fact += r.segTotals[seg.code]?.fact ?? 0; });
    return { code: seg.code, name: seg.name, plan, fact, pct: plan > 0 ? (fact / plan) * 100 : 0 };
  });

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold">Зведена по компанії</h2>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { label: 'Загальний план', value: formatUSD(grandPlan), icon: <Target className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Факт', value: formatUSD(grandFact), icon: <DollarSign className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600',
            badge: { text: `${grandPct.toFixed(0)}%`, ok: grandPct >= 20 } },
          { label: 'Виконання', value: `${grandPct.toFixed(1)}%`, icon: <TrendingUp className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Регіонів', value: String(regions.length), icon: <MapPin className="h-5 w-5" />, grad: 'from-amber-500 to-orange-600' },
          { label: 'Менеджерів', value: String(totalManagers), icon: <Users className="h-5 w-5" />, grad: 'from-sky-500 to-cyan-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${m.grad} text-white shadow-lg`}>{m.icon}</div>
              {'badge' in m && m.badge && (
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${m.badge.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {m.badge.ok ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />} {m.badge.text}
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground font-medium mt-3">{m.label}</p>
            <p className="text-2xl font-extrabold tracking-tight">{m.value}</p>
            <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br ${m.grad} opacity-[0.06] blur-2xl`} />
          </div>
        ))}
      </div>

      {/* Region cards */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Регіони</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {regionSummaries.map(region => {
            const tl = getTrafficLight(region.pct, 22.73);
            // Top 3 segments by fact
            const topSegs = SEGMENTS
              .map(seg => ({ ...seg, fact: region.segTotals[seg.code]?.fact ?? 0, plan: region.segTotals[seg.code]?.plan ?? 0 }))
              .sort((a, b) => b.fact - a.fact)
              .slice(0, 4);

            return (
              <div key={region.regionCode} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer group">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-[#066aab]" />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold">{region.regionName}</p>
                      <p className="text-[11px] text-muted-foreground">{region.managers.length} менеджерів</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт / План</p>
                      <p className="text-[14px] font-bold font-mono">{formatUSD(region.totalFact)} <span className="text-muted-foreground/50 font-normal">/ {formatUSD(region.totalPlan)}</span></p>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-14 h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                        <div className={`h-full rounded-full ${region.pct >= 20 ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc]' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                          style={{ width: `${Math.min(region.pct * 2, 100)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold ${tl.color}`}>{region.pct.toFixed(1)}%</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${tl.bg} ${tl.color}`}>{tl.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] transition-colors" />
                  </div>
                </div>

                {/* Top TMs */}
                <div className="px-5 pb-4">
                  <div className="flex gap-2 flex-wrap">
                    {topSegs.map(seg => {
                      const segPct = seg.plan > 0 ? (seg.fact / seg.plan) * 100 : 0;
                      const segTl = getTrafficLight(segPct, 22.73);
                      return (
                        <div key={seg.code} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f4f7fb] min-w-[110px]">
                          <div className={`w-2 h-2 rounded-full ${segTl.dot}`} />
                          <div>
                            <p className="text-[11px] font-semibold text-foreground/80">{seg.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{formatUSD(seg.fact)}</p>
                          </div>
                          <span className={`text-[10px] font-bold ml-auto ${segTl.color}`}>{segPct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TM summary row */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Зведена по ТМ</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {segGrandTotals.map(seg => {
            const tl = getTrafficLight(seg.pct, 22.73);
            return (
              <div key={seg.code} className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${tl.dot}`} />
                  <span className="text-[13px] font-bold">{seg.name}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${tl.bg} ${tl.color}`}>{tl.label}</span>
                </div>
                <span className="text-xl font-extrabold">{seg.pct.toFixed(1)}%</span>
                <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mt-2 mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                    style={{ width: `${Math.min(seg.pct * 2, 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{formatUSD(seg.fact)}</span>
                  <span>{formatUSD(seg.plan)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
