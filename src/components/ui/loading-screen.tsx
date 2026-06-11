'use client';

/**
 * LoadingScreen — лаконічний loader для сторінок поки тягнеться перший
 * fetch (1С, Bitrix, Supabase). Дизайн узгоджений з DashboardSkeleton:
 * чистий центральний spinner + підпис, без glass-card-«рам» і скелетонів,
 * щоб не миготіли пусті плашки.
 *
 * Використання:
 *   if (loading) return <LoadingScreen label="Завантажуємо клієнтів…" />;
 */

import { Loader2 } from 'lucide-react';

interface Props {
  label?: string;
}

export function LoadingScreen({ label = 'Завантаження…' }: Props) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-emet-blue" />
      <p className="text-[13px] font-medium">{label}</p>
    </div>
  );
}
