import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ClientFocusItem, ClientActivity } from '@/lib/use-my-clients';
import type { ClientVerification } from '@/lib/client-verifications/types';
import type { ClientFromOneC } from '@/lib/mityng-types';
import { ClientRow } from './client-row';

type PlanByClient = Record<string, { planTotal: number; brands: Record<string, number> }>;
type FactByClient = Record<string, { factTotal: number; brands: Record<string, number> }>;

/**
 * Секція «Резерв» — внизу списку, за замовч згорнута.
 * Резерв-клієнти не у плануванні, тому показуємо їх окремо без всіх метрик.
 * Sort — алфавіт (вже у parent).
 *
 * Виокремлено з clients-page.tsx (Day 4 рефактору).
 */
export function ReservedSection({
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
  renderExpand: (client: ClientFromOneC, planBrands: Record<string, number>, factBrands: Record<string, number>, focuses: ClientFocusItem[]) => React.ReactNode;
}) {
  const [sectionOpen, setSectionOpen] = useState(false);

  // У резерві теж можуть бути ті хто купив — підрахуємо для підказки.
  const boughtCount = clients.filter(c => (factByClient[c.ClientID]?.factTotal ?? 0) > 0).length;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setSectionOpen(o => !o)}
        className="w-full flex items-baseline gap-3 px-1 pt-2 flex-wrap text-left hover:opacity-80 transition-opacity"
        aria-expanded={sectionOpen}
      >
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-slate-600">
          Резерв <span className="text-muted-foreground font-semibold">· {clients.length}</span>
        </h2>
        <span className="text-[10px] text-muted-foreground font-medium">
          не враховуються у плануванні
          {boughtCount > 0 && <> · купили цього міс: <span className="text-emerald-600 font-bold">{boughtCount}</span></>}
        </span>
        <span className="ml-auto">
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sectionOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {sectionOpen && (
        <div className="flex flex-col gap-2">
          {clients.map(c => {
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
      )}
    </section>
  );
}
