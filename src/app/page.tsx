'use client';

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { PlanningPeriodBar } from '@/components/layout/planning-period-bar';
import { InstallPrompt } from '@/components/layout/install-prompt';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { RMDashboard } from '@/components/dashboard/rm-dashboard';
import { DirectorDashboard } from '@/components/dashboard/director-dashboard';
import { CompanyOverviewDashboard } from '@/components/dashboard/company-overview-dashboard';

export default function Home() {
  const user = useAppStore((s) => s.user);
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  // Toggle planning ↔ company-overview контролюється у AppHeader.
  // Активна view зберігається у Zustand store.
  const activeView = useAppStore((s) => s.activeView);

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
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <InstallPrompt />

        {activeView === 'company-overview' && canViewOverview ? (
          <CompanyOverviewDashboard />
        ) : (
          <>
            {/* PlanningPeriodBar — фільтр (тиждень + LIVE) тільки для блоку
                «Планування». Інші блоки мають свої локальні фільтри. */}
            <PlanningPeriodBar />
            {user.role === 'manager' && <ManagerDashboard />}
            {user.role === 'rm' && <RMDashboard />}
            {(user.role === 'director' || user.role === 'admin') && <DirectorDashboard />}
          </>
        )}
      </main>
    </div>
  );
}
