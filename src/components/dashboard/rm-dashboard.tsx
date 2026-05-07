'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useRegistryPlans } from '@/lib/use-registry-plans';
import { ManagerDashboard } from './manager-dashboard';
import { ChevronRight, MapPin, ClipboardList, AlertTriangle, Eye } from 'lucide-react';

interface RMDashboardProps {
  regionCode?: string; // приходить при drill-down з директорського дашборду
}

type RMView = 'dashboard' | 'myPlanning' | 'viewManager';

/**
 * Тимчасовий вигляд РМ-дашборду — поки 1С не здав Action 5 (getRegionData).
 * Показуємо:
 *  - назву регіону + кількість менеджерів зі store.user (Action 1)
 *  - кнопку «Моє планування» (відкриває менеджерський дашборд для самого РМ)
 *  - список підлеглих менеджерів (зі store.user.managedUsers) — клік відкриває
 *    повний menager-дашборд цього менеджера у режимі перегляду
 *  - банер пояснення чому нема агрегованих план/факт цифр регіону
 *
 * Коли Action 5 буде готовий — переписуємо на реальні агрегати з getRegionData
 * + adaptRegionData (адаптер уже готовий).
 */
export function RMDashboard({ regionCode }: RMDashboardProps = {}) {
  // regionCode зараз не використовується (стаб) — буде потрібен коли підключимо
  // Action 5 для фільтрації RegionData. Тримаємо у сигнатурі щоб не міняти call-sites.
  void regionCode;
  const [view, setView] = useState<RMView>('dashboard');
  const [selectedManager, setSelectedManager] = useState<string>('');

  const { user, currentPeriod } = useAppStore();
  const regionName = user?.region || '—';
  const managerLogins = useMemo(() => user?.managedUsers ?? [], [user?.managedUsers]);

  // Імена менеджерів беремо з Action 4 (getRegistryPlans) — там є managerName
  // для кожного запису плану. Action 1 повертає лише логіни — спека 1С поки
  // не розширена до [{login, fullName}], тому крос-референс на фронті.
  const monthParts = currentPeriod.month.split('-').map(Number);
  const py = Number.isFinite(monthParts[0]) && monthParts[0] > 0 ? monthParts[0] : new Date().getFullYear();
  const pm = Number.isFinite(monthParts[1]) && monthParts[1] > 0 ? monthParts[1] : new Date().getMonth() + 1;
  const dateFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
  const lastDayNum = new Date(py, pm, 0).getDate();
  const dateTo = `${py}-${String(pm).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
  const { data: plansResponse } = useRegistryPlans(dateFrom, dateTo);

  // Map login(lower) → fullName з Action 4. Якщо менеджер ще не має плану на
  // місяць — імені нема, тоді fallback на сам login.
  const namesByLogin = useMemo(() => {
    const m = new Map<string, string>();
    if (!plansResponse) return m;
    for (const p of plansResponse.plans) {
      const login = (p.managerLogin || '').toLowerCase().trim();
      if (login && p.managerName && !m.has(login)) m.set(login, p.managerName);
    }
    return m;
  }, [plansResponse]);

  // Список менеджерів з іменами (де відомі) + сортування за іменем.
  const managers = useMemo(() => {
    return managerLogins
      .map(login => {
        const lc = login.toLowerCase().trim();
        return { login, fullName: namesByLogin.get(lc) || null };
      })
      .sort((a, b) => (a.fullName || a.login).localeCompare(b.fullName || b.login, 'uk'));
  }, [managerLogins, namesByLogin]);

  // Ініціали для аватарки: «Іванов Петро Сергійович» → «ІП». Якщо тільки login — перша літера.
  const initials = (m: { login: string; fullName: string | null }) => {
    if (m.fullName) {
      const parts = m.fullName.trim().split(/\s+/).slice(0, 2);
      return parts.map(p => p[0]?.toUpperCase() || '').join('') || m.login[0]?.toUpperCase() || '?';
    }
    return m.login[0]?.toUpperCase() || '?';
  };

  if (view === 'myPlanning') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до регіону
        </button>
        <ManagerDashboard />
      </div>
    );
  }

  if (view === 'viewManager') {
    const selectedName = namesByLogin.get(selectedManager.toLowerCase().trim()) || selectedManager;
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Повернутись до регіону
        </button>
        <ManagerDashboard targetUserLogin={selectedManager} targetUserName={selectedName} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Регіон: {regionName}</h2>
          <p className="text-[12px] text-muted-foreground">{managers.length} {managers.length === 1 ? 'менеджер' : 'менеджерів'}</p>
        </div>
      </div>

      {/* Banner: Action 5 not ready */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Регіональні агрегати ще не підключені</p>
          <p className="text-amber-700">
            Метод 1С <code className="px-1 rounded bg-amber-100">getRegionData</code> (Action 5)
            ще у розробці. Поки тут видно тільки список менеджерів, кнопку «Моє планування»
            та можливість провалитись у дашборд кожного менеджера — там вже реальні дані з 1С.
            Сума план/факт по регіону з&apos;явиться коли програміст здасть Action 5.
          </p>
        </div>
      </div>

      {/* Моє планування */}
      <button
        onClick={() => setView('myPlanning')}
        className="w-full flex items-center gap-4 bg-gradient-to-r from-[#066aab]/5 via-[#0880cc]/5 to-[#066aab]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 rounded-2xl border border-[#066aab]/15 p-5 transition-all duration-300 cursor-pointer group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="text-left flex-1">
          <p className="text-[15px] font-bold text-foreground">Моє планування</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">Заповнити власний прогноз по ТМ</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#066aab] group-hover:translate-x-1 transition-all" />
      </button>

      {/* Manager list */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Менеджери регіону</h3>
        {managers.length === 0 ? (
          <p className="text-[13px] text-muted-foreground py-4 text-center">
            У 1С не вказані підлеглі менеджери для цього РМ.
          </p>
        ) : (
          <div className="space-y-2">
            {managers.map(m => (
              <button
                key={m.login}
                onClick={() => { setSelectedManager(m.login); setView('viewManager'); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-200 cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center text-[12px] font-bold text-[#066aab] shrink-0">
                  {initials(m)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-semibold truncate">
                    {m.fullName || m.login}
                  </p>
                  {m.fullName && (
                    <p className="text-[11px] text-muted-foreground truncate">{m.login}</p>
                  )}
                </div>
                <Eye className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#066aab] transition-colors" />
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[#066aab] group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
