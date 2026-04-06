'use client';

import { formatUSD, getTrafficLight } from '@/lib/format';
import { MOCK_REGION_DATA, SEGMENTS } from '@/lib/mock-data';
import { Target, DollarSign, TrendingUp, Users, MapPin, ChevronRight } from 'lucide-react';

export function RMDashboard() {
  const region = MOCK_REGION_DATA;

  const regionTotals = SEGMENTS.map(seg => {
    let totalPlan = 0, totalFact = 0;
    region.managers.forEach(m => {
      const s = m.segments.find(ms => ms.segmentCode === seg.code);
      if (s) { totalPlan += s.planAmount; totalFact += s.factAmount; }
    });
    return { code: seg.code, name: seg.name, totalPlan, totalFact, pct: totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0 };
  });

  const grandPlan = regionTotals.reduce((s, r) => s + r.totalPlan, 0);
  const grandFact = regionTotals.reduce((s, r) => s + r.totalFact, 0);
  const grandPct = grandPlan > 0 ? (grandFact / grandPlan) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Регіон: {region.regionName}</h2>
          <p className="text-[12px] text-muted-foreground">{region.managers.length} менеджерів</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'План регіону', value: formatUSD(grandPlan), icon: <Target className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Факт', value: formatUSD(grandFact), icon: <DollarSign className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600' },
          { label: 'Виконання', value: `${grandPct.toFixed(1)}%`, icon: <TrendingUp className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Менеджерів', value: String(region.managers.length), icon: <Users className="h-5 w-5" />, grad: 'from-amber-500 to-orange-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
            <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${m.grad} text-white shadow-lg mb-3`}>{m.icon}</div>
            <p className="text-[12px] text-muted-foreground font-medium">{m.label}</p>
            <p className="text-2xl font-extrabold tracking-tight">{m.value}</p>
            <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br ${m.grad} opacity-[0.06] blur-2xl`} />
          </div>
        ))}
      </div>

      {/* Manager cards */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Менеджери</h3>
        <div className="space-y-4">
          {region.managers.map(manager => {
            const mTotal = manager.segments.reduce((s, seg) => s + seg.factAmount, 0);
            const mPlan = manager.segments.reduce((s, seg) => s + seg.planAmount, 0);
            const mPct = mPlan > 0 ? (mTotal / mPlan) * 100 : 0;
            const mTl = getTrafficLight(mPct, 22.73);

            return (
              <div key={manager.login} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer group">
                {/* Manager header */}
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center text-[14px] font-bold text-[#066aab]">
                      {manager.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-[14px] font-bold">{manager.name}</p>
                      <span className={`text-[11px] font-semibold ${mTl.color}`}>{mTl.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">План</p>
                      <p className="text-[15px] font-bold font-mono">{formatUSD(mPlan)}</p>
                    </div>
                    <div className="w-px h-8 bg-[#e2e7ef]" />
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт</p>
                      <p className="text-[15px] font-extrabold font-mono">{formatUSD(mTotal)}</p>
                    </div>
                    <div className="w-16">
                      <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                          style={{ width: `${Math.min(mPct, 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-center text-muted-foreground mt-0.5 font-semibold">{mPct.toFixed(1)}%</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] transition-colors" />
                  </div>
                </div>

                {/* TM breakdown */}
                <div className="px-6 pb-4">
                  <div className="flex gap-2 flex-wrap">
                    {manager.segments.map(seg => {
                      const tl = getTrafficLight(seg.factPercent, 22.73);
                      return (
                        <div key={seg.segmentCode} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f4f7fb] min-w-[120px]">
                          <div className={`w-2 h-2 rounded-full ${tl.dot}`} />
                          <div>
                            <p className="text-[11px] font-semibold text-foreground/80">{seg.segmentName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {formatUSD(seg.factAmount)} <span className="text-muted-foreground/50">/ {formatUSD(seg.planAmount)}</span>
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold ml-auto ${tl.color}`}>{seg.factPercent.toFixed(0)}%</span>
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

      {/* Region TM summary */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Зведена по ТМ</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {regionTotals.map(rt => {
            const tl = getTrafficLight(rt.pct, 22.73);
            return (
              <div key={rt.code} className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${tl.dot}`} />
                  <span className="text-[13px] font-bold">{rt.name}</span>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${tl.bg} ${tl.color}`}>{tl.label}</span>
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xl font-extrabold">{rt.pct.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc]"
                    style={{ width: `${Math.min(rt.pct * (100 / 50), 100)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{formatUSD(rt.totalFact)}</span>
                  <span>{formatUSD(rt.totalPlan)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
