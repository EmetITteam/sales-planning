'use client';

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { InstallPrompt } from '@/components/layout/install-prompt';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { RMDashboard } from '@/components/dashboard/rm-dashboard';
import { DirectorDashboard } from '@/components/dashboard/director-dashboard';

export default function Home() {
  const user = useAppStore((s) => s.user);
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  // Bootstrap робиться у SessionBootstrap (root layout). Тут лише чекаємо
  // прапорець — щоб не блимати login form-ою для залогінених юзерів.

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

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <InstallPrompt />
        {user.role === 'manager' && <ManagerDashboard />}
        {user.role === 'rm' && <RMDashboard />}
        {user.role === 'director' && <DirectorDashboard />}
      </main>
    </div>
  );
}
