'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardErrorProps {
  message?: string;
  onRetry?: () => void;
}

/**
 * Банер помилки для дашбордів — показуємо коли fetch до 1С впав.
 *
 * Приклад:
 *   if (error) return <DashboardError message={error} onRetry={refetch} />;
 */
export function DashboardError({ message, onRetry }: DashboardErrorProps) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-4">
      <div className="w-11 h-11 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-bold text-rose-800">Не вдалося завантажити дані</h3>
        <p className="text-[13px] text-rose-700 mt-1">
          {message || 'Сервер 1С не відповідає. Спробуйте ще раз або зверніться до адміністратора.'}
        </p>
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="mt-3 h-9 px-4 text-[13px] border-rose-300 text-rose-700 hover:bg-rose-100"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Спробувати ще раз
          </Button>
        )}
      </div>
    </div>
  );
}
