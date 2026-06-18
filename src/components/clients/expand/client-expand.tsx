import { Loader2, AlertCircle } from 'lucide-react';
import { useClientReport, type ClientFocusItem } from '@/lib/use-my-clients';
import { ClientCommentsSection } from '../client-comments-section';
import { ClientClaimsSection } from '@/components/claims/client-claims-section';
import { ClientInfoBlock } from './client-info-block';
import { ClientFocusBlock } from './client-focus-block';
import { ThreeMonthHistory } from './three-month-history';
import { EventsTimeline } from './events-timeline';
import { PlanFactByBrand } from './plan-fact-by-brand';

/**
 * <ClientExpand> — orchestrator розгорнутого блоку клієнта.
 * Тягне звіт через useClientReport(clientID) і композує 6 секцій:
 *   1. ClientInfoBlock — освіта/документи/properties
 *   2. ClientCommentsSection — коментарі менеджера
 *   3. ClientFocusBlock — діючі фокуси (якщо є)
 *   4. PlanFactByBrand — основний CRM-блок
 *   5. ThreeMonthHistory — покупки за 6 міс
 *   6. EventsTimeline — зустрічі/дзвінки/семінари
 *   7. ClientClaimsSection — рекламації (Sprint 2B.C.3)
 *
 * Виокремлено з clients-page.tsx (Day 5 рефактору).
 */
export function ClientExpand({
  clientID,
  clientName,
  planBrands,
  factBrands,
  focuses,
}: {
  clientID: string;
  /** Display name — потрібен для секції «Рекламації клієнта». */
  clientName: string;
  planBrands: Record<string, number>;
  factBrands: Record<string, number>;
  focuses: ClientFocusItem[];
}) {
  const { report, loading, error } = useClientReport(clientID);

  if (loading) {
    return (
      <div className="border-t border-white/50 px-5 py-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground mt-2">Завантаження звіту…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-white/50 px-5 py-4">
        <p className="text-[12px] text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> Не вдалось завантажити звіт: {error}
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="border-t border-white/50 px-5 py-4">
        <p className="text-[12px] text-muted-foreground">Звіт по клієнту відсутній.</p>
      </div>
    );
  }

  const { clientInfo, salesReport, lastMeetings, lastCalls } = report;
  // 1С повертає семінари під ключем `seminars` (нове поле з `name`).
  // Backward-compat — підтримуємо також старий `lastSeminars` з `comment`.
  const seminarsRaw = report.seminars ?? report.lastSeminars ?? [];
  const seminars = seminarsRaw.map((s: { date: string; name?: string; comment?: string }) => ({
    date: s.date,
    comment: s.name ?? s.comment ?? '',
  }));
  const eventCount = (lastMeetings?.length || 0) + (lastCalls?.length || 0) + seminars.length;

  return (
    <div className="border-t border-white/50 px-5 py-4 space-y-4">
      <ClientInfoBlock clientInfo={clientInfo} />
      <ClientCommentsSection clientId1c={clientID} />
      {focuses.length > 0 && <ClientFocusBlock focuses={focuses} />}
      <PlanFactByBrand planBrands={planBrands} factBrands={factBrands} />
      <ThreeMonthHistory
        salesReport={salesReport}
        yearlySalesReport={report.yearlySalesReport}
        planBrands={planBrands}
      />
      <EventsTimeline
        meetings={lastMeetings ?? []}
        calls={lastCalls ?? []}
        seminars={seminars}
        totalCount={eventCount}
      />
      {/* Sprint 2B.C.3: рекламації клієнта (SWR shared cache з ClaimsList). */}
      <ClientClaimsSection clientName={clientName} />
    </div>
  );
}
