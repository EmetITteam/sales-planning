'use client';

/**
 * /admin/company-overview — back-compat роут.
 *
 * Тепер це тільки тонкий wrapper над <CompanyOverviewDashboard>.
 * Реальний компонент — `src/components/dashboard/company-overview-dashboard.tsx`.
 *
 * Цей роут залишається для прямого посилання з admin index.
 * Користувачі з canViewCompanyOverview або admin також бачать той самий
 * дашборд через toggle на головній сторінці (/).
 *
 * Доступ: admin only (інакше redirect на /).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { CompanyOverviewDashboard } from '@/components/dashboard/company-overview-dashboard';
import { ArrowLeft } from 'lucide-react';

export default function CompanyOverviewPage() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-[1400px] mx-auto space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Назад до адмін-панелі
        </Link>
        <CompanyOverviewDashboard />
      </main>
    </>
  );
}
