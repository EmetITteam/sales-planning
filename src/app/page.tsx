'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { PlanningPeriodBar } from '@/components/layout/planning-period-bar';
import { InstallPrompt } from '@/components/layout/install-prompt';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { RMDashboard } from '@/components/dashboard/rm-dashboard';
import { DirectorDashboard } from '@/components/dashboard/director-dashboard';
import { CompanyOverviewDashboard } from '@/components/dashboard/company-overview-dashboard';

/**
 * Deep-link з колокольчика (/?brand=CODE) — це планувальний перехід. Якщо юзер
 * був на «Огляді компанії», перемикаємо на «Планування», щоб змонтувати
 * ManagerDashboard (він далі сам розкриє потрібний бренд). Окремий компонент +
 * Suspense — бо useSearchParams на рівні сторінки вимагає suspense-boundary.
 */
function BrandViewSync() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const brandParam = useSearchParams().get('brand');
  useEffect(() => {
    if (brandParam && activeView === 'company-overview') setActiveView('planning');
  }, [brandParam, activeView, setActiveView]);
  return null;
}

export default function Home() {
  const user = useAppStore((s) => s.user);
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  // Toggle planning ↔ company-overview контролюється у AppHeader.
  // Активна view зберігається у Zustand store.
  const activeView = useAppStore((s) => s.activeView);

  // Тимчасовий грант на регіон (планёрки): менеджер отримує перемикач
  // «Моє планування / Регіон». Default — своє. Read-only перегляд регіону.
  const grant = user?.role === 'manager' ? user.regionGrants?.[0] : undefined;
  const [regionView, setRegionView] = useState(false);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emet-50 via-white to-emet-50">
        <div className="text-[13px] text-muted-foreground animate-pulse">Перевіряю сесію…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  // Toggle бачать: admin (завжди) + юзери з canViewCompanyOverview=true.
  // Для решти — байдуже що у store, рендеримо звичайний дашборд.
  const canViewOverview = user.role === 'admin' || user.canViewCompanyOverview === true;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <Suspense fallback={null}><BrandViewSync /></Suspense>
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <InstallPrompt />

        {activeView === 'company-overview' && canViewOverview ? (
          <CompanyOverviewDashboard />
        ) : (
          <>
            {/* PlanningPeriodBar — фільтр (тиждень + LIVE) тільки для блоку
                «Планування». Інші блоки мають свої локальні фільтри. */}
            <PlanningPeriodBar />

            {/* Тимчасовий доступ до регіону (планёрки) — перемикач + баннер */}
            {grant && (
              <div className="glass-card p-2.5 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-[12px]">
                  <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-muted-foreground">Тимчасовий доступ:</span>
                  <span className="font-bold">{grant.regionName || grant.regionCode}</span>
                  <span className="text-muted-foreground">· до {grant.validTo}</span>
                </div>
                <div className="ml-auto inline-flex rounded-xl bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setRegionView(false)}
                    className={`px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors ${!regionView ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    Моє планування
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegionView(true)}
                    className={`px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors ${regionView ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}
                  >
                    Регіон
                  </button>
                </div>
              </div>
            )}

            {user.role === 'manager' && (grant && regionView ? <RMDashboard /> : <ManagerDashboard />)}
            {user.role === 'rm' && <RMDashboard />}
            {(user.role === 'director' || user.role === 'admin') && <DirectorDashboard />}
          </>
        )}
      </main>
    </div>
  );
}
