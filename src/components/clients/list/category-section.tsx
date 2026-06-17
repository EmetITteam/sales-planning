import { useMemo } from 'react';
import type { ClientFocusItem, ClientActivity } from '@/lib/use-my-clients';
import type { ClientVerification } from '@/lib/client-verifications/types';
import { getClientName, type ClientFromOneC } from '@/lib/mityng-types';
import { CAT_COLOR, CAT_LABEL, type UICategory } from '../client-helpers';
import { ClientRow } from './client-row';

type PlanByClient = Record<string, { planTotal: number; brands: Record<string, number> }>;
type FactByClient = Record<string, { factTotal: number; brands: Record<string, number> }>;

/**
 * Секція клієнтів по категорії (Активні / Сплячі / Нові / Втрачені / Без закупок / Без категорії в 1С).
 * Sort: 4-bucket — у роботі → незаплановані → виконав → без плану, у межах — алфавіт.
 * Підрахунок під заголовком: у роботі / незаплановані / виконали / без плану.
 *
 * Виокремлено з clients-page.tsx (Day 4 рефактору).
 */
export function CategorySection({
  cat,
  clients,
  planByClient,
  factByClient,
  focusByClient,
  activityByClient,
  commentsByClient,
  verificationByClient,
  meetingMissingClientIds,
  totalsLoading,
  expandedId,
  onToggleExpand,
  onCreateMeeting,
  onCreateClaim,
  renderExpand,
}: {
  cat: UICategory;
  clients: ClientFromOneC[];
  planByClient: PlanByClient;
  factByClient: FactByClient;
  focusByClient: Record<string, ClientFocusItem[]>;
  activityByClient: Record<string, ClientActivity>;
  commentsByClient: Record<string, number>;
  verificationByClient: Record<string, ClientVerification>;
  meetingMissingClientIds: Set<string>;
  totalsLoading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onCreateMeeting?: (client: ClientFromOneC) => void;
  onCreateClaim?: (client: ClientFromOneC) => void;
  /** Як рендерити expand-блок коли клієнт розгорнутий (parent передає <ClientExpand/>). */
  renderExpand: (client: ClientFromOneC, planBrands: Record<string, number>, factBrands: Record<string, number>, focuses: ClientFocusItem[]) => React.ReactNode;
}) {
  // 4-bucket sort:
  //   0 — у роботі (план>0, факт<план): TOP
  //   1 — Незаплановані (план=0, факт>0): купив без планування
  //   2 — виконав заплановане (факт ≥ план): успіх
  //   3 — без плану (план=0, факт=0): BOTTOM
  // У межах кожного — алфавіт.
  const sorted = useMemo(() => {
    const bucket = (clientId: string): number => {
      const plan = planByClient[clientId]?.planTotal ?? 0;
      const fact = factByClient[clientId]?.factTotal ?? 0;
      if (plan > 0 && fact >= plan) return 2;
      if (plan > 0) return 0;
      if (fact > 0) return 1;
      return 3;
    };
    return [...clients].sort((a, b) => {
      const bA = bucket(a.ClientID);
      const bB = bucket(b.ClientID);
      if (bA !== bB) return bA - bB;
      return getClientName(a).localeCompare(getClientName(b), 'uk');
    });
  }, [clients, planByClient, factByClient]);

  const inProgressCount = sorted.filter(c => {
    const plan = planByClient[c.ClientID]?.planTotal ?? 0;
    const fact = factByClient[c.ClientID]?.factTotal ?? 0;
    return plan > 0 && fact < plan;
  }).length;
  const completedCount = sorted.filter(c => {
    const plan = planByClient[c.ClientID]?.planTotal ?? 0;
    const fact = factByClient[c.ClientID]?.factTotal ?? 0;
    return plan > 0 && fact >= plan;
  }).length;
  const unplannedCount = sorted.filter(c => {
    const plan = planByClient[c.ClientID]?.planTotal ?? 0;
    const fact = factByClient[c.ClientID]?.factTotal ?? 0;
    return plan === 0 && fact > 0;
  }).length;
  const emptyCount = sorted.length - inProgressCount - completedCount - unplannedCount;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-3 px-1 pt-2 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${CAT_COLOR[cat].dot}`} />
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.04em]">
          {CAT_LABEL[cat]} <span className="text-muted-foreground font-semibold">· {sorted.length}</span>
        </h2>
        {!totalsLoading && sorted.length > 0 && (
          <span className="text-[10px] text-muted-foreground font-medium">
            {inProgressCount > 0 && (
              <>у роботі: <span className="text-emet-blue font-bold">{inProgressCount}</span></>
            )}
            {unplannedCount > 0 && (
              <>{inProgressCount > 0 ? ' · ' : ''}незаплановані: <span className="text-violet-600 font-bold">{unplannedCount}</span></>
            )}
            {completedCount > 0 && (
              <>{(inProgressCount + unplannedCount) > 0 ? ' · ' : ''}виконали: <span className="text-emerald-600 font-bold">{completedCount}</span></>
            )}
            {emptyCount > 0 && (
              <>{(inProgressCount + unplannedCount + completedCount) > 0 ? ' · ' : ''}без плану: <span className="text-foreground font-bold">{emptyCount}</span></>
            )}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map(c => {
          const plan = planByClient[c.ClientID]?.planTotal ?? null;
          const fact = factByClient[c.ClientID]?.factTotal ?? null;
          const planBrands = planByClient[c.ClientID]?.brands ?? {};
          const factBrands = factByClient[c.ClientID]?.brands ?? {};
          const focuses = focusByClient[c.ClientID] ?? [];
          const isExpanded = expandedId === c.ClientID;
          return (
            <ClientRow
              key={c.ClientID}
              client={c}
              plan={plan}
              fact={fact}
              focuses={focuses}
              activity={activityByClient[c.ClientID] ?? null}
              commentsCount={commentsByClient[c.ClientID] ?? 0}
              verification={verificationByClient[c.ClientID] ?? null}
              meetingMissing={meetingMissingClientIds.has(c.ClientID)}
              totalsLoading={totalsLoading}
              expanded={isExpanded}
              onToggle={() => onToggleExpand(c.ClientID)}
              onCreateMeeting={onCreateMeeting}
              onCreateClaim={onCreateClaim}
            >
              {isExpanded && renderExpand(c, planBrands, factBrands, focuses)}
            </ClientRow>
          );
        })}
      </div>
    </section>
  );
}
