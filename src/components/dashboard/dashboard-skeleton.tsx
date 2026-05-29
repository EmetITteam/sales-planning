'use client';

/**
 * Loader для дашбордів — на час очікування fetch'а з 1С.
 *
 * Назву й експорт лишаємо `DashboardSkeleton` для зворотньої сумісності
 * (архітектурний guard за нею слідкує + всі дашборди вже імпортують).
 * Усередині — простий spinner із підписом, без скелетонів-«рам», бо вони
 * виглядали як «БД порожня / зламано».
 *
 * Використання:
 *   if (loading) return <DashboardSkeleton role="manager" />;
 */

import { Loader2 } from 'lucide-react';

interface SkeletonProps {
  role: 'manager' | 'rm' | 'director';
}

export function DashboardSkeleton({ role }: SkeletonProps) {
  const label =
    role === 'director' ? 'Завантажуємо дані компанії з 1С…' :
    role === 'rm'       ? 'Завантажуємо дані регіону з 1С…' :
                          'Завантажуємо ваші дані з 1С…';

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-emet-blue" />
      <p className="text-[13px] font-medium">{label}</p>
    </div>
  );
}
