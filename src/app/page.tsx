'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { InstallPrompt } from '@/components/layout/install-prompt';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { RMDashboard } from '@/components/dashboard/rm-dashboard';
import { DirectorDashboard } from '@/components/dashboard/director-dashboard';
import { CompanyOverviewDashboard } from '@/components/dashboard/company-overview-dashboard';

export default function Home() {
  const user = useAppStore((s) => s.user);
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  // Bootstrap робиться у SessionBootstrap (root layout). Тут лише чекаємо
  // прапорець — щоб не блимати login form-ою для залогінених юзерів.

  // Toggle режиму: основний дашборд (за роллю) vs «Огляд компанії».
  // Для admin зараз. Згодом — для будь-яких юзерів з canViewCompanyOverview=true
  // (буде у Phase 2 — нова колонка users + adminська сторінка дозволів).
  const [activeView, setActiveView] = useState<'dashboard' | 'company-overview'>('dashboard');

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8f4fc] via-white to-[#e8f4fc]">
        <div className="text-[13px] text-muted-foreground animate-pulse">Перевіряю сесію…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  // Toggle бачать: admin (завжди) + юзери з canViewCompanyOverview=true
  // (вмикається admin-ом у /admin/company-overview-permissions)
  const showOverviewToggle = user.role === 'admin' || user.canViewCompanyOverview === true;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <InstallPrompt />

        {showOverviewToggle && (
          <div className="flex justify-center">
            <div className="flex gap-1 bg-white/60 backdrop-blur-md p-1 rounded-full border border-white/50">
              <button
                onClick={() => setActiveView('dashboard')}
                className={`px-5 py-2 rounded-full text-[13px] font-semibold transition-all ${
                  activeView === 'dashboard'
                    ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white shadow-md shadow-[#066aab]/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Дашборд
              </button>
              <button
                onClick={() => setActiveView('company-overview')}
                className={`px-5 py-2 rounded-full text-[13px] font-semibold transition-all ${
                  activeView === 'company-overview'
                    ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white shadow-md shadow-[#066aab]/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Огляд компанії
              </button>
            </div>
          </div>
        )}

        {activeView === 'company-overview' && showOverviewToggle ? (
          <CompanyOverviewDashboard />
        ) : (
          <>
            {user.role === 'manager' && <ManagerDashboard />}
            {user.role === 'rm' && <RMDashboard />}
            {(user.role === 'director' || user.role === 'admin') && <DirectorDashboard />}
          </>
        )}
      </main>
    </div>
  );
}
