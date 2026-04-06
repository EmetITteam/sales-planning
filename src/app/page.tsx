'use client';

import { useAppStore } from '@/lib/store';
import { LoginForm } from '@/components/login/login-form';
import { AppHeader } from '@/components/layout/app-header';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { RMDashboard } from '@/components/dashboard/rm-dashboard';
import { DirectorDashboard } from '@/components/dashboard/director-dashboard';

export default function Home() {
  const user = useAppStore((s) => s.user);

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
