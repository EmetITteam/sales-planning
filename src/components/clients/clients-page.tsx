'use client';

/**
 * <ClientsPage> — «Мої клієнти» (CRM-режим).
 *
 * Дані Stage 1 (цей коміт):
 *  - `getManagerClients({login})` — bulk список + категорії + телефони
 *  - `getClientReport({clientID})` — lazy при кліку, для 3-міс історії + подій
 *
 * Stage 2 (наступний коміт): план/факт інтеграція + тег «Виконав заплановане».
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, Cake } from 'lucide-react';
import { useMyClients, useClientsTotals, useClientActivities, useClientFocuses, useClientActivationPlan } from '@/lib/use-my-clients';
import { useAppStore } from '@/lib/store';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { useRegistryPlans } from '@/lib/use-registry-plans';
import { adaptRegistryPlans } from '@/lib/onec-adapters';
import { isTrialManager } from '@/lib/trial-manager';
import { NewClientDialog } from './new-client-dialog';
import { GlobalClientSearchDialog } from './global-client-search-dialog';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MeetingForm, type MeetingFormData } from '@/components/meetings/meeting-form';
import { ClaimFormDialog } from '@/components/claims/claim-form-dialog';
import { useClientCommentsCounts } from '@/lib/use-client-comments';
import { useClientVerificationsForManager } from '@/lib/use-client-verifications';
import type { ClientVerification } from '@/lib/client-verifications/types';
import {
  toUICategory,
  CAT_LABEL,
  CAT_COLOR,
  CAT_ORDER,
  type UICategory,
} from './client-helpers';
import {
  getClientName,
  getClientAddress,
  isClientReserved,
  getClientBirthDate,
  getAge,
  isBirthdayToday,
  type ClientFromOneC,
} from '@/lib/mityng-types';
import { FilterPill } from './shared/filter-pill';
import { PageTitle, buildHeaderSubtitle } from './filters/page-title';
import { ClientsMonthFilter } from './filters/clients-month-filter';
import { HeroVykonannya } from './hero/hero-vykonannya';
import { HeroBaza } from './hero/hero-baza';
import { HeroActivation } from './hero/hero-activation';
import { HeroContacts } from './hero/hero-contacts';
import { ClientRow } from './list/client-row';
import { CategorySection } from './list/category-section';
import { ReservedSection } from './list/reserved-section';
import { ClientExpand } from './expand/client-expand';
import { pluralUaYears } from './client-helpers';

export function ClientsPage() {
  const sessionUser = useAppStore(s => s.user);
  const { clients, loading, error, refetch } = useMyClients();
  const [search, setSearch] = useState('');
  // 'all' / категорія / 'focused' (у фокусі) / 'with-plan' (з планом)
  const [activeFilter, setActiveFilter] = useState<UICategory | 'all' | 'focused' | 'with-plan'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [meetingForClient, setMeetingForClient] = useState<ClientFromOneC | null>(null);
  // Sprint 2B.C: prefill ClaimFormDialog клієнтом з картки. Аналог meetingForClient.
  const [claimForClient, setClaimForClient] = useState<ClientFromOneC | null>(null);

  // Локальний month-фільтр (поточний / попередні 3 / свій). Default — поточний
  // місяць. Незалежний від глобального currentPeriod (planning-режим).
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const isCurrentMonth = useMemo(() => {
    const d = new Date();
    const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return cur === selectedMonth;
  }, [selectedMonth]);

  // Deep-link ?focus=ID — приходить з /meetings dossier dialog (link «Відкрити
  // повне досьє»). Single-client view: ховаємо всіх інших + одразу expand.
  // Так UX не змушує скролити повз 250+ клієнтів.
  //
  // useSearchParams реактивний у Next.js 16 App Router, але `router.replace`
  // інколи не triggers повний re-render у same-path navigation. Тримаємо
  // локальний `focusOverride` state який можемо примусово очистити кліком —
  // він має перевагу над URL-параметром.
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlFocusId = searchParams?.get('focus') ?? null;
  const [focusOverride, setFocusOverride] = useState<string | null | 'cleared'>(null);
  const focusId = focusOverride === 'cleared' ? null : (focusOverride ?? urlFocusId);
  const focusHandledRef = useRef(false);

  useEffect(() => {
    // Якщо користувач знов прийшов з ?focus=, скидаємо override
    if (urlFocusId) setFocusOverride(null);
  }, [urlFocusId]);

  useEffect(() => {
    if (!focusId || focusHandledRef.current) return;
    if (clients.length === 0) return;
    setActiveFilter('all');
    setSearch('');
    setExpandedId(focusId);
    focusHandledRef.current = true;
  }, [focusId, clients.length]);

  const clearFocus = () => {
    focusHandledRef.current = false;
    setExpandedId(null);
    setFocusOverride('cleared');
    // best-effort: прибираємо ?focus= з URL (history-only, не triggers re-render)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/clients');
    }
  };

  // План (Supabase) + Факт (1С getSalesFact) по всіх клієнтах менеджера
  const clientIds = useMemo(() => clients.map(c => c.ClientID).filter(Boolean), [clients]);
  const { planByClient, factByClient, meetingStageClientIds, loading: totalsLoading } = useClientsTotals(
    sessionUser?.login ?? null,
    clientIds,
    selectedMonth,
  );
  // Контактна активність (зустрічі/дзвінки цього міс) — для Hero Card 4
  const { activityByClient, loading: activitiesLoading } = useClientActivities(
    sessionUser?.login ?? null,
    clientIds,
    selectedMonth,
  );
  // Bulk-counts коментарів менеджера — для badge «коментарі: N» у згорнутій картці.
  const { counts: commentsByClient } = useClientCommentsCounts(clientIds);
  // Активні верифікації КЦ через Bitrix SPA 1048 (pending/in_progress/clarification).
  // Зберігаємо як Map для lookup + Set ID для виключення з регулярних категорій
  // (клієнти на верифікації показуються окремою секцією зверху).
  const { verifications: activeVerifications } = useClientVerificationsForManager();
  const verificationByClient = useMemo(() => {
    const m: Record<string, ClientVerification> = {};
    for (const v of activeVerifications) m[v.clientId1c] = v;
    return m;
  }, [activeVerifications]);

  // Клієнти, у яких в плані поточного місяця стоїть етап «Зустріч», але у 1С
  // ще нема жодної зустрічі цього місяця. Менеджер забув запланувати дату/час.
  // Допоки activities ще тягнуться — порожній set (не блимаємо червоним).
  const meetingMissingClientIds = useMemo(() => {
    if (activitiesLoading) return new Set<string>();
    const out = new Set<string>();
    meetingStageClientIds.forEach(id => {
      if (!activityByClient[id]?.hasMeeting) out.add(id);
    });
    return out;
  }, [meetingStageClientIds, activityByClient, activitiesLoading]);
  // Фокуси клієнтів (Action A) — для chip у рядку + блок у expanded
  const { focusByClient } = useClientFocuses(sessionUser?.login ?? null, clientIds);

  // === База клієнтів за правилом: НЕ-резерв + резерв-купуючі (fact>0) ===
  // Резерв-некупуючих виключаємо зі всіх метрик (за домовленістю).
  const baseClients = useMemo(() => {
    return clients.filter(c => {
      if (!isClientReserved(c)) return true;
      // Резерв-клієнт: включаємо ЯКЩО купив (fact > 0)
      const fact = factByClient[c.ClientID]?.factTotal ?? 0;
      return fact > 0;
    });
  }, [clients, factByClient]);
  const reservedCount = clients.filter(isClientReserved).length;
  const reservedActiveCount = clients.filter(c => {
    if (!isClientReserved(c)) return false;
    const fact = factByClient[c.ClientID]?.factTotal ?? 0;
    return fact > 0;
  }).length;

  // === Counts per category — по БАЗІ (без резерв-некупуючих) ===
  const countsByCategory = useMemo(() => {
    const counts: Record<UICategory, number> = {
      active: 0, sleeping: 0, new: 0, lost: 0, none: 0, missing: 0,
    };
    for (const c of baseClients) counts[toUICategory(c.ClientCategory)]++;
    return counts;
  }, [baseClients]);

  // Working-days metrics + Registry Plan для Card 1 (Виконання).
  // Реєстровий план тягнемо тим самим способом що manager-dashboard —
  // щоб цифри на /clients ↔ /planning збігались (не сума forecasts менеджера,
  // а офіційний план з 1С Action 4).
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const sessionLoginLower = (sessionUser?.login ?? '').toLowerCase().trim();
  const { dateFrom, dateTo } = useMemo(() => {
    const monthParts = currentPeriod.month.split('-').map(Number);
    const py = Number.isFinite(monthParts[0]) && monthParts[0] > 0 ? monthParts[0] : new Date().getFullYear();
    const pm = Number.isFinite(monthParts[1]) && monthParts[1] > 0 ? monthParts[1] : new Date().getMonth() + 1;
    const dateFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
    const lastDay = new Date(py, pm, 0).getDate();
    const dateTo = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { dateFrom, dateTo };
  }, [currentPeriod.month]);
  // Cold-start 1С обробляє сам хук: передаємо login → isEmptyResponse рахує
  // «порожньо» = немає плану для ЦЬОГО менеджера, тож вбудований retry
  // (3× з backoff, тримає loading=true) відновлює план без блимання $0.
  const { data: registryPlansResponse, loading: registryPlansLoading, refetch: refetchRegistryPlans } = useRegistryPlans(
    sessionLoginLower !== 'anonymous' ? dateFrom : null,
    sessionLoginLower !== 'anonymous' ? dateTo : null,
    sessionUser?.login ?? null,
  );
  // Реєстровий план менеджера: total (сума по сегментах) + isTrial-детект.
  // Акумулюємо per-segment (як manager-dashboard) — total збігається з /planning.
  // isTrial: 1С виставляє $1-sentinel на КОЖЕН сегмент новачкам на випробувальному
  // (план≈$9, факт=$1143 → 12700%). Без guard Картка «Виконання» вибухає.
  const registryPlan = useMemo(() => {
    if (!registryPlansResponse) return { total: 0, isTrial: false };
    const bySegment = new Map<string, number>();
    for (const p of adaptRegistryPlans(registryPlansResponse)) {
      if (p.managerLogin === sessionLoginLower) {
        bySegment.set(p.segmentCode, (bySegment.get(p.segmentCode) ?? 0) + p.planAmount);
      }
    }
    const vals = [...bySegment.values()];
    return { total: vals.reduce((s, v) => s + v, 0), isTrial: isTrialManager(vals) };
  }, [registryPlansResponse, sessionLoginLower]);

  // Auto-reload guard: якщо через 30с після mount план = 0 і loading=false —
  // 1С повернула empty (cold-start handler застряг). SWR mutate його не
  // прокинула. Робимо м'який hard-reload (як F5) — новий JS context дзвонить
  // 1С знов, handler прокидається, дані вантажаться.
  // sessionStorage flag запобігає loop: робимо це МАКСИМУМ 1 раз на сесію.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionLoginLower === 'anonymous') return;
    const FLAG_KEY = `emet:autoReloadOnce:${sessionLoginLower}`;
    if (sessionStorage.getItem(FLAG_KEY)) return; // вже робили
    const timer = setTimeout(() => {
      // Повторно перевіряємо план у момент tick — якщо за 30с план з'явився, нічого не робимо.
      if (registryPlan.total === 0 && !registryPlansLoading) {
        sessionStorage.setItem(FLAG_KEY, '1');
        window.location.reload();
      }
    }, 30000);
    return () => clearTimeout(timer);
    // Ловимо тільки на mount/login зміну; зміна registryPlan.total самостійно не повинна
    // ре-арм-увати timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoginLower]);

  // План активації бази (Action B) — login-bound, 1 документ на менеджера+місяць.
  const { plan: activationPlan } = useClientActivationPlan(
    sessionUser?.login ?? null,
    currentPeriod.month?.slice(0, 7) ?? null,
  );

  const wd = useMemo(() => {
    const now = new Date();
    const m = currentPeriod.month?.slice(0, 7);
    let year: number;
    let month: number;
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      const [y, mm] = m.split('-').map(n => parseInt(n, 10));
      year = y;
      month = mm - 1;
    } else {
      year = now.getFullYear();
      month = now.getMonth();
    }
    const totalWD = getWorkingDaysInMonth(year, month);
    const passedWD = getPassedWorkingDays(year, month, now);
    const calcPct = getMonthProgressPct(year, month, now);
    return { totalWD, passedWD, calcPct };
  }, [currentPeriod.month]);

  // === Hero metrics обчислюємо по базі ===
  const heroMetrics = useMemo(() => {
    // Card 1 — Виконання $план/факт/%/темп.
    // ВАЖЛИВО: planTotal беремо з Registry (Action 4) — щоб збігалось з /planning.
    // Раніше брали суму planByClient (forecasts+gap_closures менеджера, що
    // концептуально інше — це його прогноз, не офіційний план від керівника).
    const planTotal = registryPlan.total;
    let factTotal = 0;
    for (const c of baseClients) {
      factTotal += factByClient[c.ClientID]?.factTotal ?? 0;
    }
    const pct = planTotal > 0 ? (factTotal / planTotal) * 100 : 0;
    const forecastPct = (planTotal > 0 && wd.passedWD > 0)
      ? (factTotal * wd.totalWD) / (planTotal * wd.passedWD) * 100
      : 0;

    // Card 3 — Виконання по клієнтах (скільки з планом / виконали)
    let withPlanCnt = 0;
    let completedCnt = 0;
    for (const c of baseClients) {
      const p = planByClient[c.ClientID]?.planTotal ?? 0;
      const f = factByClient[c.ClientID]?.factTotal ?? 0;
      if (p > 0) {
        withPlanCnt++;
        if (f >= p) completedCnt++;
      }
    }

    // Card 4 — Контактна активність (через checkActivities, як було спочатку).
    // LastMeetingDate bulk-поле виявилось порожнім для більшості — повертаємо
    // на checkActivities (1С перевіряє чому hasCall=false для тих хто дзвонив).
    let clientsWithCall = 0;
    let clientsWithMeeting = 0;
    let clientsWithAnyEvent = 0;
    let noContacts = 0;
    let noContactsWithPlan = 0;
    let noContactsWithoutPlan = 0;
    for (const c of baseClients) {
      const a = activityByClient[c.ClientID];
      const hasCall = !!a?.hasCall;
      const hasMeeting = !!a?.hasMeeting;
      const hasAny = hasCall || hasMeeting;
      if (hasCall) clientsWithCall++;
      if (hasMeeting) clientsWithMeeting++;
      if (hasAny) {
        clientsWithAnyEvent++;
      } else {
        noContacts++;
        const p = planByClient[c.ClientID]?.planTotal ?? 0;
        if (p > 0) noContactsWithPlan++;
        else noContactsWithoutPlan++;
      }
    }
    const coveragePct = baseClients.length > 0
      ? (clientsWithAnyEvent / baseClients.length) * 100
      : 0;

    return {
      planTotal, factTotal, pct, forecastPct,
      withPlanCnt, completedCnt,
      clientsWithCall, clientsWithMeeting, clientsWithAnyEvent,
      coveragePct, noContacts, noContactsWithPlan, noContactsWithoutPlan,
    };
  }, [baseClients, planByClient, factByClient, activityByClient, wd.passedWD, wd.totalWD, registryPlan.total]);

  // Counts для clickable hero-counters
  const focusedCount = useMemo(() =>
    baseClients.filter(c => (focusByClient[c.ClientID]?.length ?? 0) > 0).length,
    [baseClients, focusByClient]);

  // Скільки клієнтів КУПИЛО (fact>0) по кожній категорії + разом — для картки «База».
  const boughtData = useMemo(() => {
    const byCat: Record<UICategory, number> = { active: 0, sleeping: 0, new: 0, lost: 0, none: 0, missing: 0 };
    let total = 0;
    for (const c of baseClients) {
      if ((factByClient[c.ClientID]?.factTotal ?? 0) > 0) {
        byCat[toUICategory(c.ClientCategory)]++;
        total++;
      }
    }
    return { byCat, total };
  }, [baseClients, factByClient]);

  // === План активації: план з 1С (planCount) vs ФАКТ активовано (наш розрахунок) ===
  // «активовано» = клієнти цієї категорії що купили цього міс (fact>0). totalInCategory
  // з 1С НЕ використовуємо — категорії рахуємо самі (видно у картці «База»).
  const activationData = useMemo(() => {
    const activatedByCat: Partial<Record<UICategory, number>> = {};
    for (const c of baseClients) {
      if ((factByClient[c.ClientID]?.factTotal ?? 0) > 0) {
        const uc = toUICategory(c.ClientCategory);
        activatedByCat[uc] = (activatedByCat[uc] ?? 0) + 1;
      }
    }
    const rows = (activationPlan?.activations ?? []).map(a => {
      const uc = toUICategory(a.category);
      return {
        uiCat: uc,
        label: CAT_LABEL[uc],
        dotClass: CAT_COLOR[uc].dot,
        planCount: a.planCount,
        activated: activatedByCat[uc] ?? 0,
      };
    });
    return {
      rows,
      planSum: rows.reduce((s, r) => s + r.planCount, 0),
      activatedSum: rows.reduce((s, r) => s + r.activated, 0),
      hasDoc: !!activationPlan?.documentNumber,
    };
  }, [activationPlan, baseClients, factByClient]);

  // === Filtered + grouped clients (БЕЗ резерв-некупуючих — вони у окремій секції) ===
  // activeFilter може бути:
  //   'all' — без фільтру
  //   UICategory — стандартний категорійний фільтр
  //   'focused' — тільки клієнти що мають хоч 1 активний фокус
  //   'with-plan' — тільки клієнти у яких planTotal > 0
  const groupedClients = useMemo(() => {
    const lowSearch = search.trim().toLowerCase();
    const filtered = baseClients.filter(c => {
      // Deep-link focus → показуємо ТІЛЬКИ цього клієнта (single-client view).
      if (focusId) return c.ClientID === focusId;
      // Спочатку фільтр (категорія / focused / with-plan)
      if (activeFilter === 'focused') {
        if ((focusByClient[c.ClientID]?.length ?? 0) === 0) return false;
      } else if (activeFilter === 'with-plan') {
        if ((planByClient[c.ClientID]?.planTotal ?? 0) <= 0) return false;
      } else if (activeFilter !== 'all') {
        if (toUICategory(c.ClientCategory) !== activeFilter) return false;
      }
      // Потім — пошук
      if (!lowSearch) return true;
      const name = getClientName(c).toLowerCase();
      const phone = (c.Phone ?? '').toLowerCase();
      return name.includes(lowSearch) || phone.includes(lowSearch);
    });

    const groups = new Map<UICategory, ClientFromOneC[]>();
    for (const cat of CAT_ORDER) groups.set(cat, []);
    for (const c of filtered) groups.get(toUICategory(c.ClientCategory))!.push(c);
    for (const arr of groups.values()) {
      arr.sort((a, b) => getClientName(a).localeCompare(getClientName(b), 'uk'));
    }
    return groups;
  }, [baseClients, search, activeFilter, focusId, focusByClient, planByClient]);

  // === Резерв-клієнти (всі резерв, незалежно від купівлі) — для окремої секції ===
  const reservedClients = useMemo(() => {
    const lowSearch = search.trim().toLowerCase();
    return clients
      .filter(isClientReserved)
      .filter(c => {
        if (!lowSearch) return true;
        const name = getClientName(c).toLowerCase();
        const phone = (c.Phone ?? '').toLowerCase();
        return name.includes(lowSearch) || phone.includes(lowSearch);
      })
      .sort((a, b) => getClientName(a).localeCompare(getClientName(b), 'uk'));
  }, [clients, search]);

  const totalFiltered = useMemo(() => Array.from(groupedClients.values()).reduce((s, arr) => s + arr.length, 0), [groupedClients]);

  // === Loading / Error states ===
  if (loading && clients.length === 0) {
    return <LoadingScreen label="Завантажуємо клієнтів…" />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageTitle subtitle="Помилка завантаження" />
        <div className="glass-card p-6">
          <p className="text-[13px] text-rose-700 mb-3">Не вдалось завантажити список клієнтів: {error}</p>
          <button onClick={refetch} className="px-4 py-2 rounded-xl bg-emet-blue text-white text-[13px] font-semibold">Спробувати знову</button>
        </div>
      </div>
    );
  }

  // Focus-mode (?focus=ID): show single client view, Hero band/search ховаємо.
  // ШУКАЄМО У ПОВНОМУ clients-списку (не у baseClients): резерв-некупуючі
  // клієнти все одно можуть мати зустріч і вести на /clients?focus=, але
  // baseClients їх виключає → видно «не знайдено» хоча клієнт існує.
  if (focusId) {
    const focusClient = clients.find(c => c.ClientID === focusId);
    const focusName = focusClient ? getClientName(focusClient) : focusId;
    return (
      <div className="space-y-4 max-w-full overflow-x-hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={clearFocus}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white/60 border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-white hover:border-emet-blue hover:text-emet-blue transition-colors"
          >
            <span aria-hidden>←</span> Усі клієнти
          </button>
          <div className="text-[14px] text-slate-600">
            Показую лише <strong className="text-emet-ink">{focusName}</strong>
          </div>
        </div>

        <div className="space-y-3">
          {focusClient ? (
            <ClientRow
              key={focusClient.ClientID}
              client={focusClient}
              plan={planByClient[focusClient.ClientID]?.planTotal ?? null}
              fact={factByClient[focusClient.ClientID]?.factTotal ?? null}
              focuses={focusByClient[focusClient.ClientID] ?? []}
              activity={activityByClient[focusClient.ClientID] ?? null}
              commentsCount={commentsByClient[focusClient.ClientID] ?? 0}
              verification={verificationByClient[focusClient.ClientID] ?? null}
              meetingMissing={meetingMissingClientIds.has(focusClient.ClientID)}
              totalsLoading={totalsLoading}
              expanded={expandedId === focusClient.ClientID}
              onToggle={() => setExpandedId(expandedId === focusClient.ClientID ? null : focusClient.ClientID)}
              onCreateMeeting={(c) => setMeetingForClient(c)}
              onCreateClaim={(c) => setClaimForClient(c)}
            >
              <ClientExpand
                clientID={focusClient.ClientID}
                clientName={getClientName(focusClient)}
                planBrands={planByClient[focusClient.ClientID]?.brands ?? {}}
                factBrands={factByClient[focusClient.ClientID]?.brands ?? {}}
                focuses={focusByClient[focusClient.ClientID] ?? []}
              />
            </ClientRow>
          ) : (
            <div className="glass-card-flat px-4 py-6 text-center text-[13px] text-slate-500">
              Клієнт з кодом <span className="font-mono">{focusId}</span> не знайдено у вашому списку.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle
        subtitle={buildHeaderSubtitle(clients.length, selectedMonth, isCurrentMonth)}
        onNewClient={() => setNewClientOpen(true)}
        onGlobalSearch={() => setGlobalSearchOpen(true)}
      />
      <BirthdayBanner clients={baseClients} onClientClick={setFocusOverride} />
      <ClientsMonthFilter selectedMonth={selectedMonth} onChange={setSelectedMonth} />

      {/* === HERO BAND — 4 картки за домовленістю 2026-05-27 === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Card 1 — ВИКОНАННЯ ($план / факт / % / норма / темп) */}
        <HeroVykonannya
          index={0}
          planTotal={heroMetrics.planTotal}
          factTotal={heroMetrics.factTotal}
          pct={heroMetrics.pct}
          calcPct={wd.calcPct}
          forecastPct={heroMetrics.forecastPct}
          completedCount={heroMetrics.completedCnt}
          withPlanCount={heroMetrics.withPlanCnt}
          isTrial={registryPlan.isTrial}
          loading={registryPlansLoading && heroMetrics.planTotal === 0}
          onRefetchPlan={refetchRegistryPlans}
        />

        {/* Card 2 — БАЗА КЛІЄНТІВ (включно з резерв-купуючими; резерв-sub-row) */}
        <HeroBaza
          index={1}
          baseTotal={baseClients.length}
          counts={countsByCategory}
          boughtByCategory={boughtData.byCat}
          totalBought={boughtData.total}
          reservedCount={reservedCount}
          reservedActiveCount={reservedActiveCount}
        />

        {/* Card 3 — ПЛАН АКТИВАЦІЇ (Action B: план з 1С vs факт активовано) */}
        <HeroActivation
          index={2}
          rows={activationData.rows}
          planSum={activationData.planSum}
          activatedSum={activationData.activatedSum}
          hasDoc={activationData.hasDoc}
          withPlanCount={heroMetrics.withPlanCnt}
          focusedCount={focusedCount}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        {/* Card 4 — КОНТАКТНА АКТИВНІСТЬ (зустрічі+дзвінки цього міс) */}
        <HeroContacts
          index={3}
          loading={activitiesLoading}
          baseTotal={baseClients.length}
          withCall={heroMetrics.clientsWithCall}
          withMeeting={heroMetrics.clientsWithMeeting}
          coveragePct={heroMetrics.coveragePct}
          noContacts={heroMetrics.noContacts}
          noContactsWithPlan={heroMetrics.noContactsWithPlan}
          noContactsWithoutPlan={heroMetrics.noContactsWithoutPlan}
        />
      </div>

      {/* === SEARCH + FILTER PILLS (sticky під header-ом) ===
          Header висота 56px. Glass-card сама має backdrop-blur — окремий
          фон-overlay не треба (раніше gradient давав «виступаючі білі кути»). */}
      <div className="sticky top-[56px] z-30 py-2">
      <div className="glass-card p-3 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по назві або телефону…"
            className="w-full pl-9 pr-9 h-10 rounded-xl bg-white/50 border border-white/60 text-[13px] focus:outline-none focus:ring-2 focus:ring-emet-blue/40 focus:border-emet-blue"
            aria-label="Пошук клієнта"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Очистити пошук"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterPill active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} count={clients.length}>Усі</FilterPill>
          {CAT_ORDER.filter(c => countsByCategory[c] > 0).map(cat => (
            <FilterPill
              key={cat}
              active={activeFilter === cat}
              onClick={() => setActiveFilter(cat)}
              count={countsByCategory[cat]}
              dotClass={CAT_COLOR[cat].dot}
            >
              {CAT_LABEL[cat]}
            </FilterPill>
          ))}
        </div>
      </div>
      </div>

      {/* === CATEGORY SECTIONS ===
          Резерв-секцію показуємо ТІЛЬКИ у режимі 'all' — бо це окремий
          розділ «не звертай уваги», а не категорія. При активному фільтрі
          (категорія/focused/with-plan) Резерв ховаємо щоб empty-state
          коректно спрацьовував. */}
      {(() => {
        const showReserved = activeFilter === 'all' && reservedClients.length > 0;
        if (totalFiltered === 0 && !showReserved) {
          return (
            <div className="glass-card p-12 text-center text-[13px] text-muted-foreground">
              {search ? `За запитом «${search}» нічого не знайдено` : 'Немає клієнтів у обраному фільтрі'}
            </div>
          );
        }
        return (
          <>
            {CAT_ORDER.map(cat => {
              const list = groupedClients.get(cat) || [];
              if (list.length === 0) return null;
              return (
                <CategorySection
                  key={cat}
                  cat={cat}
                  clients={list}
                  planByClient={planByClient}
                  factByClient={factByClient}
                  focusByClient={focusByClient}
                  activityByClient={activityByClient}
                  commentsByClient={commentsByClient}
                  verificationByClient={verificationByClient}
                  meetingMissingClientIds={meetingMissingClientIds}
                  totalsLoading={totalsLoading}
                  expandedId={expandedId}
                  onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
                  onCreateMeeting={(c) => setMeetingForClient(c)}
                  onCreateClaim={(c) => setClaimForClient(c)}
                  renderExpand={(c, planBrands, factBrands, focuses) => (
                    <ClientExpand
                      clientID={c.ClientID}
                      clientName={getClientName(c)}
                      planBrands={planBrands}
                      factBrands={factBrands}
                      focuses={focuses}
                    />
                  )}
                />
              );
            })}
            {showReserved && (
              <ReservedSection
                clients={reservedClients}
                planByClient={planByClient}
                factByClient={factByClient}
                focusByClient={focusByClient}
                activityByClient={activityByClient}
                commentsByClient={commentsByClient}
                verificationByClient={verificationByClient}
                meetingMissingClientIds={meetingMissingClientIds}
                totalsLoading={totalsLoading}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
                onCreateMeeting={(c) => setMeetingForClient(c)}
                onCreateClaim={(c) => setClaimForClient(c)}
                renderExpand={(c, planBrands, factBrands, focuses) => (
                  <ClientExpand
                    clientID={c.ClientID}
                    clientName={getClientName(c)}
                    planBrands={planBrands}
                    factBrands={factBrands}
                    focuses={focuses}
                  />
                )}
              />
            )}
          </>
        );
      })()}

      <GlobalClientSearchDialog
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onSelectMine={clientId => {
          // Тицянув свого клієнта у результатах пошуку → закриваємо діалог
          // і фокусуємо картку в «Мої клієнти» (single-client view + expand).
          // Скидаємо handled-flag щоб ефект focusId спрацював заново на новий ID.
          focusHandledRef.current = false;
          setFocusOverride(clientId);
          setGlobalSearchOpen(false);
        }}
      />

      <NewClientDialog
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onCreated={createdName => {
          setToastMsg(`Клієнта «${createdName}» успішно створено.`);
          refetch();
          setTimeout(() => setToastMsg(null), 4000);
        }}
        onOpenExistingClient={clientId => {
          // Duplicate-warning: менеджер натиснув «Відкрити» на існуючому
          // своєму клієнті → фокусуємо картку через той самий focusOverride.
          focusHandledRef.current = false;
          setFocusOverride(clientId);
        }}
      />

      <MeetingForm
        open={meetingForClient !== null}
        mode="create"
        prefilledClientId={meetingForClient?.ClientID}
        onClose={() => setMeetingForClient(null)}
        onSave={async (data: MeetingFormData) => {
          try {
            const res = await fetch('/api/meetings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                clientId1c: data.clientId1c,
                date: data.date,
                time: data.time,
                durationMin: data.durationMin,
                purpose: data.purpose || null,
                comment: data.comment || null,
                plannedAddress: data.plannedAddress || null,
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const name = meetingForClient ? getClientName(meetingForClient) : 'клієнт';
            setToastMsg(`Зустріч з «${name}» створено.`);
            setMeetingForClient(null);
            setTimeout(() => setToastMsg(null), 4000);
          } catch (e) {
            setToastMsg(`Помилка: ${(e as Error).message}`);
            setTimeout(() => setToastMsg(null), 5000);
          }
        }}
      />

      {/* Sprint 2B.C: ClaimFormDialog з prefilled клієнтом. */}
      <ClaimFormDialog
        open={claimForClient !== null}
        onClose={() => setClaimForClient(null)}
        prefilledClient={
          claimForClient
            ? {
                clientId1c: claimForClient.ClientID,
                clientName: getClientName(claimForClient),
                phone: claimForClient.Phone ?? '',
                address: getClientAddress(claimForClient) ?? '',
              }
            : null
        }
        onCreated={id => {
          setToastMsg(`Рекламацію №${id} створено.`);
          setTimeout(() => setToastMsg(null), 4000);
        }}
      />

      {toastMsg && (
        <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto sm:max-w-[360px] pointer-events-none">
          <div className="pointer-events-auto rounded-xl px-4 py-3 text-[13px] font-semibold bg-teal-600 text-white shadow-[0_12px_28px_rgba(6,42,61,0.25)]">
            {toastMsg}
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * BirthdayBanner — повідомлення вгорі /clients про клієнтів, у кого
 * сьогодні день народження. Клік по клієнту → focus на його картку
 * (через setFocusOverride).
 */
function BirthdayBanner({
  clients,
  onClientClick,
}: {
  clients: ClientFromOneC[];
  onClientClick: (clientId: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const birthdayClients = useMemo(
    () =>
      clients.filter(c => {
        const iso = getClientBirthDate(c);
        return iso && isBirthdayToday(iso, today);
      }),
    [clients, today],
  );

  if (birthdayClients.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-emet-blue/20 px-4 py-3 shadow-[0_4px_14px_rgba(6,42,61,0.04)] flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-emet-blue/10 text-emet-blue flex items-center justify-center shrink-0">
        <Cake className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold tracking-tight text-emet-ink">
          Сьогодні день народження у {birthdayClients.length} {pluralUaClient(birthdayClients.length)}
        </div>
        <div className="text-[12px] text-slate-600 mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
          {birthdayClients.map((c, i) => {
            const iso = getClientBirthDate(c);
            const age = getAge(iso, today);
            return (
              <button
                key={c.ClientID}
                type="button"
                onClick={() => onClientClick(c.ClientID)}
                className="inline-flex items-center gap-1 text-emet-blue hover:text-emet-blue-light font-semibold underline decoration-emet-blue/30 hover:decoration-emet-blue transition-colors"
                title={`Перейти до картки${age != null ? ` · ${age} ${pluralUaYears(age)}` : ''}`}
              >
                {getClientName(c)}
                {age != null && (
                  <span className="text-slate-500 font-normal">
                    ({age} {pluralUaYears(age)})
                  </span>
                )}
                {i < birthdayClients.length - 1 && <span className="text-slate-400">,</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Український plural для слова «клієнт» — без зовнішнього helper-a. */
function pluralUaClient(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'клієнта';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'клієнтів';
  return 'клієнтів';
}

// pluralUaYears виокремлено у client-helpers.ts (Day 4)

