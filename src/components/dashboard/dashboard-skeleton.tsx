'use client';

/**
 * Скелетони для дашбордів — на час очікування fetch'а з 1С.
 *
 * Використання у дашборді (приклад):
 *   const { data, loading, error } = useDashboardData(...);
 *   if (loading) return <DashboardSkeleton role="manager" />;
 *   if (error) return <DashboardError onRetry={refetch} message={error} />;
 *   ...
 */

interface SkeletonProps {
  role: 'manager' | 'rm' | 'director';
}

export function DashboardSkeleton({ role }: SkeletonProps) {
  const topcardCount = role === 'manager' ? 4 : 5;
  return (
    <div className="space-y-8 animate-pulse">
      {/* Топ-картки */}
      <div className={`grid grid-cols-2 lg:grid-cols-${topcardCount} gap-3`}>
        {Array.from({ length: topcardCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Брендові рядки (мокового вмісту 4-5 штук) */}
      <div>
        <div className="h-5 w-32 bg-[#e2e7ef] rounded mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm h-[88px] flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#e2e7ef] shrink-0" />
              <div className="w-24 h-3 bg-[#e2e7ef] rounded" />
              <div className="w-16 h-5 bg-[#e2e7ef] rounded" />
              <div className="flex-1 h-2 bg-[#e2e7ef] rounded" />
              <div className="w-16 h-3 bg-[#e2e7ef] rounded" />
              <div className="w-12 h-3 bg-[#e2e7ef] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm min-h-[110px] flex flex-col">
      <div className="h-2.5 w-20 bg-[#e2e7ef] rounded" />
      <div className="flex-1 flex flex-col justify-center mt-2 gap-2">
        <div className="h-6 w-32 bg-[#e2e7ef] rounded" />
        <div className="h-2.5 w-40 bg-[#e2e7ef] rounded" />
      </div>
    </div>
  );
}
