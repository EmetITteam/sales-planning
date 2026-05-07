'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { apiMe } from '@/lib/auth-client';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { RMDashboard } from '@/components/dashboard/rm-dashboard';
import { DirectorDashboard } from '@/components/dashboard/director-dashboard';

export default function Home() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  // Bootstrap: на mount питаємо у /api/auth/me чи є валідна cookie. Поки чекаємо
  // — показуємо нейтральний splash щоб не блимати login form-ою для залогінених.
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    apiMe().then(u => {
      if (u) setUser(u);
      setBootstrapped(true);
    });
  }, [setUser]);

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
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full">
        {user.role === 'manager' && <ManagerDashboard />}
        {user.role === 'rm' && <RMDashboard />}
        {user.role === 'director' && <DirectorDashboard />}
      </main>
    </div>
  );
}
