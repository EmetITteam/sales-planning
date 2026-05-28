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

import { useMemo, useState, useEffect } from 'react';
import { Search, Phone, Users, CheckCircle2, AlertCircle, ChevronDown, X, Loader2, Calendar, GraduationCap } from 'lucide-react';
import { useMyClients, useClientReport, useClientsTotals, useClientActivities, useClientFocuses, useClientActivationPlan, type ClientFocusItem } from '@/lib/use-my-clients';
import { useAppStore } from '@/lib/store';
import { SEGMENTS } from '@/lib/mock-data';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { useRegistryPlans } from '@/lib/use-registry-plans';
import { adaptRegistryPlans } from '@/lib/onec-adapters';

const BRAND_NAMES: Record<string, string> = Object.fromEntries(SEGMENTS.map(s => [s.code, s.name]));

/**
 * Аліаси кодів брендів — нормалізують різні написання тієї самої сутності
 * у блоку «План × Факт» (3-міс історія лишається з усіма sub-брендами окремо).
 *
 * Правила за домовленістю 2026-05-27:
 *  - 'Vitaran Cosmetics' / 'Vitaran БАДи' / будь-який 'Vitaran ...' → OTHER (Інші ТМ)
 *  - 'IUSE Collagen' / 'IUSE SkinBooster' / 'IUSE Hair' / 'IUSE ...' → IUSE (головна ТМ)
 *  - 'ДРУГИЕ ТМ' / 'Інші ТМ' / 'OTHER BRANDS' → OTHER
 *
 * Direct match має пріоритет; далі — pattern по prefix.
 */
const BRAND_CODE_ALIASES: Record<string, string> = {
  'ДРУГИЕ ТМ': 'OTHER',
  'другие тм': 'OTHER',
  'ДРУГИЕТМ': 'OTHER',   // 1С шле без пробілу — основний код Action 3/4
  'другиетм': 'OTHER',
  'Інші ТМ': 'OTHER',
  'інші тм': 'OTHER',
  'OTHER BRANDS': 'OTHER',
};
function canonicalSegmentCode(raw: string): string {
  const cleaned = (raw ?? '').replace(/^_+/, '').trim();
  if (!cleaned) return raw;

  // Direct alias match (RU/UA/інші написання)
  if (BRAND_CODE_ALIASES[cleaned]) return BRAND_CODE_ALIASES[cleaned];
  const lower = cleaned.toLowerCase();
  if (BRAND_CODE_ALIASES[lower]) return BRAND_CODE_ALIASES[lower];

  // Pattern: «Vitaran <будь-що>» (Cosmetics, БАДи, тощо) → OTHER
  // Сам 'Vitaran' / 'VITARAN' (без пробілу після) → нормалізуємо до UPPERCASE
  if (lower.startsWith('vitaran ')) return 'OTHER';
  // Pattern: «IUSE <будь-що>» (Collagen, SkinBooster, Hair) → IUSE main
  if (lower.startsWith('iuse ')) return 'IUSE';

  // Повертаємо UPPERCASE для consistent matching між segment-кодами (VITARAN)
  // та display-назвами з 1С (Neuramis / Vitaran). Це робить set.has() справжнім
  // case-insensitive lookup без перевідбудови мапи.
  return cleaned.toUpperCase();
}
import { mapClientCategory } from '@/lib/onec-adapters';
import { getClientName, getClientAddress, isClientReserved, type ClientFromOneC } from '@/lib/mityng-types';

// === Категорійні групи ===
// 5 реальних категорій 1С + окремий error-bucket «Без категорії в 1С»
// для виявлення проблем у даних 1С (поле порожнє у контрагента).
type UICategory = 'active' | 'sleeping' | 'new' | 'lost' | 'none' | 'missing';

const CAT_LABEL: Record<UICategory, string> = {
  active:   'Активні',
  sleeping: 'Сплячі',
  new:      'Нові',
  lost:     'Втрачені',
  none:     'Без закупок',
  missing:  'Без категорії в 1С',
};
const CAT_COLOR: Record<UICategory, { dot: string; ring: string; text: string }> = {
  active:   { dot: 'bg-emet-blue shadow-[0_0_6px_#066aab]',  ring: 'text-emet-blue',   text: 'text-emet-blue' },
  sleeping: { dot: 'bg-amber-500 shadow-[0_0_6px_#d97706]',   ring: 'text-amber-600',   text: 'text-amber-600' },
  new:      { dot: 'bg-emerald-500 shadow-[0_0_6px_#10b981]', ring: 'text-emerald-500', text: 'text-emerald-600' },
  lost:     { dot: 'bg-rose-500 shadow-[0_0_6px_#e11d48]',    ring: 'text-rose-500',    text: 'text-rose-600' },
  none:     { dot: 'bg-slate-400 shadow-[0_0_6px_#94a3b8]',   ring: 'text-slate-500',   text: 'text-slate-500' },
  // missing = warning: дані з 1С неповні; жовтогарячий щоб впадало в око
  missing:  { dot: 'bg-orange-500 shadow-[0_0_6px_#f97316]',  ring: 'text-orange-600',  text: 'text-orange-600' },
};

function toUICategory(raw: string | null | undefined): UICategory {
  // Реально порожнє поле у 1С → error-bucket (щоб менеджер міг побачити і виправити в 1С)
  if (!raw || !raw.trim()) return 'missing';
  // mapClientCategory повертає 'active'|'sleeping'|'lost'|'new'|'none' (none = "Без закупок")
  return mapClientCategory(raw);
}

/**
 * Переклад 1С-категорії (russian) → українська для chip у рядку клієнта.
 * Якщо 1С раптом поверне UA-варіант — повертаємо як є.
 */
function toUkrainianChip(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return 'Без категорії в 1С';
  const cat = toUICategory(raw);
  switch (cat) {
    case 'active':   return 'Активний';
    case 'sleeping': return 'Сплячий';
    case 'new':      return 'Новий';
    case 'lost':     return 'Втрачений';
    case 'none':     return 'Без закупок';
    case 'missing':  return 'Без категорії в 1С';
  }
}

const CAT_ORDER: UICategory[] = ['active', 'sleeping', 'new', 'lost', 'none', 'missing'];

// Initials з назви клієнта (для аватара) — defensive: 1С іноді повертає undefined
function initials(name: string | null | undefined): string {
  const safe = (name ?? '').trim();
  if (!safe) return '?';
  const parts = safe.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

export function ClientsPage() {
  const sessionUser = useAppStore(s => s.user);
  const { clients, loading, error, refetch } = useMyClients();
  const [search, setSearch] = useState('');
  // 'all' / категорія / 'focused' (у фокусі) / 'with-plan' (з планом)
  const [activeFilter, setActiveFilter] = useState<UICategory | 'all' | 'focused' | 'with-plan'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // План (Supabase) + Факт (1С getSalesFact) по всіх клієнтах менеджера
  const clientIds = useMemo(() => clients.map(c => c.ClientID).filter(Boolean), [clients]);
  const { planByClient, factByClient, loading: totalsLoading } = useClientsTotals(
    sessionUser?.login ?? null,
    clientIds,
  );
  // Контактна активність (зустрічі/дзвінки цього міс) — для Hero Card 4
  const { activityByClient } = useClientActivities(sessionUser?.login ?? null, clientIds);
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
  const { data: registryPlansResponse, loading: plansLoading, error: plansError, refetch: refetchPlans } = useRegistryPlans(
    sessionLoginLower !== 'anonymous' ? dateFrom : null,
    sessionLoginLower !== 'anonymous' ? dateTo : null,
  );
  // Auto-retry для cold-start 1С: на першому getRegistryPlans після логіну 1С
  // інколи повертає plans[] для ІНШИХ менеджерів, але не для цього → план $0.
  // Hook-level retry спрацьовує лише коли plans[] глобально порожній, тому тут
  // окремий per-login retry (дзеркало manager-dashboard) — інакше /clients
  // показував би План $0 до ручного перезавантаження.
  const [planRetryAttempt, setPlanRetryAttempt] = useState(0);
  useEffect(() => {
    if (!registryPlansResponse || plansLoading || plansError) return;
    const delays = [1200, 2500, 4000, 6000, 8000, 10000];
    if (planRetryAttempt >= delays.length) return;
    const myPlans = adaptRegistryPlans(registryPlansResponse).filter(p => p.managerLogin === sessionLoginLower);
    if (myPlans.length === 0) {
      const t = setTimeout(() => { setPlanRetryAttempt(n => n + 1); refetchPlans(); }, delays[planRetryAttempt]);
      return () => clearTimeout(t);
    }
  }, [registryPlansResponse, plansLoading, plansError, sessionLoginLower, planRetryAttempt, refetchPlans]);
  useEffect(() => { setPlanRetryAttempt(0); }, [sessionLoginLower]);
  // Сума реєстрового плану для поточного менеджера (всі бренди).
  const registryPlanTotal = useMemo(() => {
    if (!registryPlansResponse) return 0;
    let sum = 0;
    for (const p of adaptRegistryPlans(registryPlansResponse)) {
      if (p.managerLogin === sessionLoginLower) sum += p.planAmount;
    }
    return sum;
  }, [registryPlansResponse, sessionLoginLower]);

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
    const planTotal = registryPlanTotal;
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
  }, [baseClients, planByClient, factByClient, activityByClient, wd.passedWD, wd.totalWD, registryPlanTotal]);

  // Counts для clickable hero-counters
  const focusedCount = useMemo(() =>
    baseClients.filter(c => (focusByClient[c.ClientID]?.length ?? 0) > 0).length,
    [baseClients, focusByClient]);

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
  }, [baseClients, search, activeFilter]);

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
    return (
      <div className="space-y-4">
        <PageTitle subtitle="Завантаження клієнтів з 1С…" />
        <div className="glass-card p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-emet-blue" />
        </div>
      </div>
    );
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

  return (
    <div className="space-y-4">
      <PageTitle subtitle={buildHeaderSubtitle(clients.length)} />

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
        />

        {/* Card 2 — БАЗА КЛІЄНТІВ (включно з резерв-купуючими; резерв-sub-row) */}
        <HeroBaza
          index={1}
          baseTotal={baseClients.length}
          counts={countsByCategory}
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
          completedCount={heroMetrics.completedCnt}
          focusedCount={focusedCount}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        {/* Card 4 — КОНТАКТНА АКТИВНІСТЬ (зустрічі+дзвінки цього міс) */}
        <HeroContacts
          index={3}
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
                  totalsLoading={totalsLoading}
                  expandedId={expandedId}
                  onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
                />
              );
            })}
            {showReserved && (
              <ReservedSection
                clients={reservedClients}
                planByClient={planByClient}
                factByClient={factByClient}
                focusByClient={focusByClient}
                totalsLoading={totalsLoading}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
              />
            )}
          </>
        );
      })()}
    </div>
  );
}

// === Page title ===
function PageTitle({ subtitle }: { subtitle: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-emet-blue text-white flex items-center justify-center shadow-[0_4px_12px_rgba(6,106,171,0.25)]">
        <Users className="h-5 w-5" />
      </div>
      <div>
        <h1 className="text-[18px] font-bold tracking-tight">Мої клієнти</h1>
        <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</div>
      </div>
    </div>
  );
}

/**
 * Helper для заголовка — рядок 1 (поточна дата + місяць) + рядок 2 (як працює LIVE).
 * Виноситься відразу під «Мої клієнти» щоб менеджер розумів window даних.
 */
function buildHeaderSubtitle(clientsCount: number): React.ReactNode {
  const d = new Date();
  const monthLabel = `${UA_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const today = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return (
    <>
      <span>{clientsCount} клієнтів · {monthLabel} · станом на <span className="font-semibold tabular-nums text-foreground/80">{today}</span></span>
      <span className="block text-[11px] text-muted-foreground/70 mt-0.5">
        Дані «План × Факт» — за поточний місяць. Кнопка <strong className="text-foreground/80">LIVE</strong> міняє лише швидкість оновлення, діапазон завжди «з 1-го по сьогодні».
      </span>
    </>
  );
}

// === HERO CARDS ===

const fmtUSD = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
// flex-col + gap-3 — БЕЗ justify-between. Великі цифри сидять одразу під label
// на одному вертикальному рівні у всіх 4 картках (раніше justify-between
// розводив зверху-знизу і цифри стрибали залежно від обсягу нижнього контенту).
const heroCardCls = 'glass-card p-5 relative flex flex-col gap-3 fade-stagger';

/** Card 1 — Виконання (план / факт / % / норма / темп). */
function HeroVykonannya({ index, planTotal, factTotal, pct, calcPct, forecastPct }: {
  index: number;
  planTotal: number; factTotal: number; pct: number;
  calcPct: number; forecastPct: number;
}) {
  let pctColor = 'text-rose-600';
  if (pct >= 100) pctColor = 'text-emerald-700';
  else if (pct >= calcPct) pctColor = 'text-emerald-600';
  else if (pct >= calcPct - 10) pctColor = 'text-amber-600';
  // Темп має свій traffic-light окремо
  let forecastColor = 'text-rose-600';
  if (forecastPct >= 100) forecastColor = 'text-emerald-700';
  else if (forecastPct >= 80) forecastColor = 'text-amber-600';
  const amb = pct >= calcPct ? 'good' : pct >= calcPct - 15 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emet-blue shadow-[0_0_6px_currentColor] text-emet-blue" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
      </div>
      <div>
        <p className={`text-[36px] font-bold tracking-[-1px] tabular-nums leading-none ${pctColor}`}>
          {pct.toFixed(0)}<span className="text-[22px] font-medium text-muted-foreground">%</span>
        </p>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">План:</span>
        <span className="font-mono font-semibold text-foreground tabular-nums text-right amount">{fmtUSD(planTotal)}</span>
        <span className="text-muted-foreground">Факт:</span>
        <span className="font-mono font-semibold text-foreground tabular-nums text-right amount">{fmtUSD(factTotal)}</span>
        <span className="text-muted-foreground">Норма:</span>
        <span className="font-mono font-semibold text-foreground tabular-nums text-right">{calcPct.toFixed(0)}%</span>
        <span className="text-muted-foreground">Темп:</span>
        <span className={`font-mono font-semibold tabular-nums text-right ${forecastColor}`}>{forecastPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

/** Card 2 — База клієнтів (категорії + резерв-sub-row). */
function HeroBaza({ index, baseTotal, counts, reservedCount, reservedActiveCount }: {
  index: number; baseTotal: number;
  counts: Record<UICategory, number>;
  reservedCount: number; reservedActiveCount: number;
}) {
  const visibleCats: UICategory[] = ['active', 'sleeping', 'new', 'lost', 'none'];
  return (
    <div className={`${heroCardCls} ambient-accent`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">База клієнтів</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">{baseTotal}</p>
        <p className="text-[11px] text-muted-foreground">клієнтів</p>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px]">
        {visibleCats.filter(c => counts[c] > 0).map(c => {
          const pct = baseTotal > 0 ? Math.round((counts[c] / baseTotal) * 100) : 0;
          return (
            <div key={c} className="grid grid-cols-[8px_1fr_auto_auto] gap-x-2 items-center">
              <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[c].dot}`} />
              <span className="text-foreground">{CAT_LABEL[c]}</span>
              <span className="font-mono font-bold tabular-nums">{counts[c]}</span>
              <span className="text-muted-foreground text-[10px] tabular-nums">{pct}%</span>
            </div>
          );
        })}
        {reservedCount > 0 && (
          <div className="grid grid-cols-[8px_1fr_auto_auto] gap-x-2 items-center pt-1 mt-1 border-t border-white/40 text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span title={`У базі лише ${reservedActiveCount} які купили (з ${reservedCount})`}>
              Резерв · купили {reservedActiveCount}/{reservedCount}
            </span>
            <span className="font-mono font-bold tabular-nums">{reservedCount}</span>
            <span className="text-[10px] tabular-nums">{baseTotal > 0 ? Math.round((reservedActiveCount/baseTotal)*100) : 0}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Card 3 — План активації бази (Action B): план з 1С vs факт активовано. */
function HeroActivation({ index, rows, planSum, activatedSum, hasDoc, withPlanCount, completedCount, focusedCount, activeFilter, onFilterChange }: {
  index: number;
  rows: Array<{ uiCat: string; label: string; dotClass: string; planCount: number; activated: number }>;
  planSum: number;
  activatedSum: number;
  hasDoc: boolean;
  withPlanCount: number;
  completedCount: number;
  focusedCount: number;
  activeFilter: string;
  onFilterChange: (f: 'all' | 'focused' | 'with-plan') => void;
}) {
  const pct = planSum > 0 ? Math.round((activatedSum / planSum) * 100) : 0;
  let pctColor = 'text-rose-600';
  if (pct >= 80) pctColor = 'text-emerald-600';
  else if (pct >= 50) pctColor = 'text-amber-600';
  // 2-й параметр (старий): виконали запланований обсяг (factу ≥ план по клієнту).
  const execPct = withPlanCount > 0 ? Math.round((completedCount / withPlanCount) * 100) : 0;
  const execColor = execPct >= 80 ? 'text-emerald-600' : execPct >= 50 ? 'text-amber-600' : 'text-rose-600';
  const planFilterActive = activeFilter === 'with-plan';
  const focusFilterActive = activeFilter === 'focused';
  const amb = !hasDoc ? 'accent' : pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_#8b5cf6]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План активації</p>
      </div>
      {hasDoc && planSum > 0 ? (
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
              {activatedSum}
              <span className="text-[22px] font-medium text-muted-foreground"> / {planSum}</span>
            </p>
            <p className={`text-[14px] font-bold ${pctColor}`}>{pct}%</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">активовано клієнтів з плану</p>
        </div>
      ) : (
        <div className="py-1">
          <p className="text-[13px] font-semibold text-muted-foreground">План активації не заведено в 1С</p>
        </div>
      )}
      {/* Розклад по категоріях: активовано / план */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[11px]">
          {rows.map(r => (
            <div key={r.uiCat} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${r.dotClass}`} />
              <span className="text-foreground flex-1 truncate">{r.label}</span>
              <span className="font-mono font-bold tabular-nums">
                <span className={r.activated >= r.planCount ? 'text-emerald-600' : 'text-foreground'}>{r.activated}</span>
                <span className="text-muted-foreground font-normal"> / {r.planCount}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {/* 2-й параметр: виконання запланованого обсягу по клієнтах (старий). */}
      <div className="flex items-baseline justify-between pt-2 border-t border-slate-200/50">
        <span className="text-[11px] text-muted-foreground">Виконали запланований обсяг</span>
        <span className="text-[12px] font-bold tabular-nums">
          <span className="font-mono">{completedCount}<span className="text-muted-foreground font-normal"> / {withPlanCount}</span></span>
          <span className={`ml-1.5 ${execColor}`}>{execPct}%</span>
        </span>
      </div>
      <div className="flex flex-col gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => onFilterChange(planFilterActive ? 'all' : 'with-plan')}
          className={`flex items-center justify-between px-2 py-1 -mx-2 rounded-lg text-[11px] transition-colors ${
            planFilterActive
              ? 'bg-emet-blue/15 text-emet-blue font-bold'
              : 'hover:bg-emet-blue/5 text-foreground'
          }`}
          title="Клік — відфільтрувати лише клієнтів з планом"
        >
          <span>{planFilterActive ? '✓ ' : ''}Клієнтів з планом</span>
          <span className="font-mono font-bold tabular-nums">{withPlanCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onFilterChange(focusFilterActive ? 'all' : 'focused')}
          className={`flex items-center justify-between px-2 py-1 -mx-2 rounded-lg text-[11px] transition-colors ${
            focusFilterActive
              ? 'bg-violet-500/15 text-violet-700 font-bold'
              : 'hover:bg-violet-500/5 text-foreground'
          }`}
          title="Клік — відфільтрувати лише клієнтів у фокусі"
        >
          <span>{focusFilterActive ? '✓ ' : ''}Клієнтів у фокусі</span>
          <span className="font-mono font-bold tabular-nums">{focusedCount}</span>
        </button>
      </div>
    </div>
  );
}

/** Card 4 — Контактна активність (зустрічі + дзвінки цього міс). */
function HeroContacts({ index, baseTotal, withCall, withMeeting, coveragePct, noContacts, noContactsWithPlan, noContactsWithoutPlan }: {
  index: number; baseTotal: number;
  withCall: number; withMeeting: number;
  coveragePct: number; noContacts: number;
  noContactsWithPlan: number; noContactsWithoutPlan: number;
}) {
  let pctColor = 'text-rose-600';
  if (coveragePct >= 80) pctColor = 'text-emerald-600';
  else if (coveragePct >= 50) pctColor = 'text-amber-600';
  const amb = coveragePct >= 80 ? 'good' : coveragePct >= 50 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#d97706]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Контактна активність</p>
      </div>
      <div>
        <p className={`text-[36px] font-bold tracking-[-1px] tabular-nums leading-none ${pctColor}`}>
          {coveragePct.toFixed(0)}<span className="text-[22px] font-medium text-muted-foreground">%</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">бази покрито подіями</p>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Calendar className="h-3 w-3 text-emet-blue" />зустрічі:
        </span>
        <span className="font-mono font-bold tabular-nums text-right">{withMeeting}</span>
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Phone className="h-3 w-3 text-emerald-600" />дзвінки:
        </span>
        <span className="font-mono font-bold tabular-nums text-right">{withCall}</span>
        <span className="text-muted-foreground border-t border-white/40 pt-1 mt-0.5">без контактів:</span>
        <span className="font-mono font-bold tabular-nums text-right text-rose-600 border-t border-white/40 pt-1 mt-0.5">
          {noContacts}
        </span>
        <span className="text-[10px] text-muted-foreground/70 col-span-2 leading-snug">
          ↳ з планом: <span className="font-bold text-rose-600">{noContactsWithPlan}</span>
          {' · '}без плану: <span className="font-bold">{noContactsWithoutPlan}</span>
        </span>
      </div>
    </div>
  );
}

// === Filter pill ===
function FilterPill({
  active, onClick, count, dotClass, children,
}: {
  active: boolean; onClick: () => void; count: number; dotClass?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-all ${
        active
          ? 'bg-emet-blue text-white shadow-[0_4px_12px_rgba(6,106,171,0.25)] border border-emet-blue'
          : 'bg-white/50 border border-white/60 hover:bg-white/70 hover:-translate-y-px'
      }`}
    >
      {dotClass && <span className={`w-2 h-2 rounded-full ${dotClass}`} />}
      <span>{children}</span>
      <span className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-full tabular-nums ${
        active ? 'bg-white/25 text-white' : 'bg-emet-blue/10 text-emet-blue'
      }`}>
        {count}
      </span>
    </button>
  );
}

// === Category section header + list ===
function CategorySection({
  cat, clients, planByClient, factByClient, focusByClient, totalsLoading, expandedId, onToggleExpand,
}: {
  cat: UICategory; clients: ClientFromOneC[];
  planByClient: Record<string, { planTotal: number; brands: Record<string, number> }>;
  factByClient: Record<string, { factTotal: number; brands: Record<string, number> }>;
  focusByClient: Record<string, ClientFocusItem[]>;
  totalsLoading: boolean;
  expandedId: string | null; onToggleExpand: (id: string) => void;
}) {
  // 4-bucket sort:
  //   0 — у роботі (план>0, факт<план): TOP
  //   1 — Незаплановані (план=0, факт>0): купив без планування, треба уваги
  //   2 — виконав заплановане (факт >= план): успіх
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
          return (
            <ClientRow
              key={c.ClientID}
              client={c}
              plan={plan}
              fact={fact}
              planBrands={planBrands}
              factBrands={factBrands}
              focuses={focuses}
              totalsLoading={totalsLoading}
              expanded={expandedId === c.ClientID}
              onToggle={() => onToggleExpand(c.ClientID)}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * Окрема секція РЕЗЕРВ — внизу списку, за замовч згорнута.
 * Резерв-клієнти не у плануванні, тому показуємо їх окремо без всіх метрик.
 * Sort — алфавіт.
 */
function ReservedSection({ clients, planByClient, factByClient, focusByClient, totalsLoading, expandedId, onToggleExpand }: {
  clients: ClientFromOneC[];
  planByClient: Record<string, { planTotal: number; brands: Record<string, number> }>;
  factByClient: Record<string, { factTotal: number; brands: Record<string, number> }>;
  focusByClient: Record<string, ClientFocusItem[]>;
  totalsLoading: boolean;
  expandedId: string | null; onToggleExpand: (id: string) => void;
}) {
  const [sectionOpen, setSectionOpen] = useState(false);

  // У резерві теж можуть бути ті хто купив — підрахуємо для підказки
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
            return (
              <ClientRow
                key={c.ClientID}
                client={c}
                plan={plan}
                fact={fact}
                planBrands={planBrands}
                factBrands={factBrands}
                focuses={focuses}
                totalsLoading={totalsLoading}
                expanded={expandedId === c.ClientID}
                onToggle={() => onToggleExpand(c.ClientID)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// === One client row with accordion-expand ===
function ClientRow({ client, plan, fact, planBrands, factBrands, focuses, totalsLoading, expanded, onToggle }: {
  client: ClientFromOneC;
  plan: number | null;
  fact: number | null;
  planBrands: Record<string, number>;
  factBrands: Record<string, number>;
  focuses: ClientFocusItem[];
  totalsLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cat = toUICategory(client.ClientCategory);
  const phoneClean = (client.Phone || '').replace(/[^+\d]/g, '');
  const name = getClientName(client);
  const address = getClientAddress(client);
  // Стани плану/факту:
  //   totalsLoading=true → ще тягнемо → '—'
  //   plan>0 → реальна сума (з planом)
  //   plan===null/0, fact===null/0 → реально нема ні плану ні факту → «Без плану» badge
  //   plan===null/0, fact>0 → купив без планування → «Незаплановані» badge (warn)
  const hasPlan = plan != null && Number.isFinite(plan) && plan > 0;
  const hasFact = fact != null && Number.isFinite(fact) && fact > 0;
  const rawPct = (hasPlan && fact != null && Number.isFinite(fact)) ? (fact / (plan as number)) * 100 : null;
  const pct: number | null = (rawPct !== null && Number.isFinite(rawPct)) ? rawPct : null;
  const completed = hasPlan && fact != null && fact >= (plan as number);
  // 3 стани коли НЕ loading:
  const noPlanNoFact = !totalsLoading && !hasPlan && !hasFact; // повністю «Без плану»
  const unplannedFact = !totalsLoading && !hasPlan && hasFact; // купив без планування — «Незаплановані»
  const dimmedRow = noPlanNoFact; // приглушуємо тільки повністю-порожні

  return (
    <div className={`glass-card-flat overflow-hidden ${dimmedRow ? 'opacity-70' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full grid grid-cols-[40px_minmax(0,1fr)_24px] md:grid-cols-[40px_minmax(0,1.6fr)_85px_85px_70px_24px] gap-3 md:gap-4 items-center px-4 py-3 hover:bg-white/40 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40"
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl bg-emet-50 ${CAT_COLOR[cat].text} flex items-center justify-center text-[12px] font-bold shrink-0`}>
          {initials(name)}
        </div>

        {/* Name + UA-category-chip | address · phone */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[14px] font-bold truncate">{name || '— без назви —'}</p>
            {/* Chip-категорія українською (Активний/Сплячий/Новий/Втрачений/Без закупок) */}
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-white/40 ${CAT_COLOR[cat].text}`}>
              {toUkrainianChip(client.ClientCategory)}
            </span>
            {/* Резерв-tag (нейтральний slate, бо на цих клієнтів менеджер не звертає уваги) */}
            {isClientReserved(client) && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-slate-400/12 text-slate-600 border border-slate-300/50 backdrop-blur-sm" title="Клієнт у Резерві — виключений з планування">
                Резерв
              </span>
            )}
            {/* Focus-tag (violet) — є хоча б 1 активний фокус */}
            {focuses.length > 0 && (
              <span
                className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-violet-500/12 text-violet-700 border border-violet-300/40 backdrop-blur-sm"
                title={focuses.map(f => f.focusName).join(' · ')}
              >
                У фокусі{focuses.length > 1 ? ` · ${focuses.length}` : ''}
              </span>
            )}
            {noPlanNoFact && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-slate-400/10 text-slate-500 border border-dashed border-slate-300/60 backdrop-blur-sm" title="Цього клієнта менеджер не виставив у план і він не купував цього місяця">
                Без плану
              </span>
            )}
            {unplannedFact && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-violet-500/12 text-violet-700 border border-violet-300/40 backdrop-blur-sm" title="Купив без планування — треба додати у план наступним місяцем">
                Незаплановані
              </span>
            )}
            {!totalsLoading && completed && (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-emerald-500/12 text-emerald-700 border border-emerald-300/40 backdrop-blur-sm">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Виконав
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 min-w-0">
            {address && <span className="truncate">{address}</span>}
            {client.Phone && (
              <>
                {address && <span className="text-muted-foreground/40 shrink-0">·</span>}
                <a
                  href={`tel:${phoneClean}`}
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-emet-blue transition-colors shrink-0"
                >
                  <Phone className="h-3 w-3" />
                  <span className="tabular-nums">{client.Phone}</span>
                </a>
              </>
            )}
          </div>
        </div>

        {/* План / Факт / % — desktop only. */}
        <NumCol label="План" value={plan} loading={totalsLoading} emptyAs={hasFact ? 'zero' : null} />
        <NumCol label="Факт" value={fact} loading={totalsLoading} emptyAs="zero" />
        <PctCol pct={pct} loading={totalsLoading} disabled={!hasPlan} />

        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <ClientExpand
          clientID={client.ClientID}
          planBrands={planBrands}
          factBrands={factBrands}
          focuses={focuses}
        />
      )}
    </div>
  );
}

/**
 * Колонка з $-сумою (План/Факт).
 *  - loading=true → '—' (gray, ще тягнемо)
 *  - value=null АБО 0 → залежить від emptyAs
 *    - 'zero' (default) → '$0'
 *    - null → нічого не показуємо (для no-plan клієнтів — план не виставлено)
 *  - value>0 → реальна сума
 */
function NumCol({ label, value, loading, emptyAs = 'zero' }: {
  label: string; value: number | null; loading: boolean; emptyAs?: 'zero' | null;
}) {
  return (
    <div className="hidden md:block text-right">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">{label}</p>
      <p className="text-[13px] font-bold font-mono tabular-nums mt-1 leading-none whitespace-nowrap amount">
        {loading ? (
          <span className="text-muted-foreground/40">—</span>
        ) : value && value > 0 ? (
          `$${Math.round(value).toLocaleString('en-US')}`
        ) : emptyAs === 'zero' ? (
          <span className="text-muted-foreground/60">$0</span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </p>
    </div>
  );
}

/** % виконання. loading → '—' gray; disabled (no plan) → '—' light; реал → traffic-light. */
function PctCol({ pct, loading, disabled }: { pct: number | null; loading: boolean; disabled: boolean }) {
  let cls = 'text-muted-foreground/50';
  if (!loading && !disabled && pct !== null) {
    if (pct >= 100) cls = 'text-emerald-700';
    else if (pct >= 80) cls = 'text-emerald-600';
    else if (pct >= 50) cls = 'text-amber-600';
    else cls = 'text-rose-600';
  }
  return (
    <div className="hidden md:block text-right">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">Викон.</p>
      <p className={`text-[13px] font-bold font-mono tabular-nums mt-1 leading-none ${cls}`}>
        {loading || disabled || pct === null ? '—' : `${pct.toFixed(0)}%`}
      </p>
    </div>
  );
}

// === Accordion-розгортання з детальним звітом ===
function ClientExpand({ clientID, planBrands, factBrands, focuses }: {
  clientID: string;
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
  // Нормалізуємо до {date, comment} для UI (name → comment)
  const seminars = seminarsRaw.map((s: { date: string; name?: string; comment?: string }) => ({
    date: s.date,
    comment: s.name ?? s.comment ?? '',
  }));
  const eventCount = (lastMeetings?.length || 0) + (lastCalls?.length || 0) + seminars.length;

  return (
    <div className="border-t border-white/50 px-5 py-4 space-y-4">
      {/* Інформація по клієнту — об'єднує освіту, документи та properties */}
      <ClientInfoBlock clientInfo={clientInfo} />

      {/* Діючі фокуси клієнта — перед План×Факт бо це контекст до планування */}
      {focuses.length > 0 && <ClientFocusBlock focuses={focuses} />}

      {/* ПЛАН × ФАКТ ЦЬОГО МІСЯЦЯ ПО БРЕНДАХ — основний CRM-блок */}
      <PlanFactByBrand planBrands={planBrands} factBrands={factBrands} />

      {/* Історія покупок — тягне 12-міс з yearlySalesReport (fallback: salesReport-3-міс).
          Обрізаємо до останніх 6 міс без поточного. */}
      <ThreeMonthHistory
        salesReport={salesReport}
        yearlySalesReport={report.yearlySalesReport}
        planBrands={planBrands}
      />

      {/* Події — таймлайн (об'єднання зустрічей/дзвінків/семінарів за датою desc) */}
      <EventsTimeline
        meetings={lastMeetings ?? []}
        calls={lastCalls ?? []}
        seminars={seminars}
        totalCount={eventCount}
      />
    </div>
  );
}

/** Helper — прибрати ведучий '_' (у 1С деякі бренди приходять як '_ESSE' / '_Neuronox'). */
function cleanBrandName(name: string | undefined | null): string {
  return (name ?? '').replace(/^_+/, '').trim();
}

/**
 * Парсинг RU/UA month-label ('Май 2026' | 'Травень 2026' | 'АПРЕЛЬ 2026')
 * у формат YYYY-MM. Якщо не вдалося розпарсити — повертає null.
 */
const MONTH_PREFIXES_LOWER = [
  ['янв', 'січ'],       // 01
  ['фев', 'лют'],       // 02
  ['март', 'берез'],    // 03
  ['апр', 'квіт'],      // 04
  ['май', 'трав'],      // 05
  ['июн', 'черв'],      // 06
  ['июл', 'лип'],       // 07
  ['авг', 'серп'],      // 08
  ['сент', 'верес'],    // 09
  ['окт', 'жовт'],      // 10
  ['нояб', 'лист'],     // 11
  ['дек', 'груд'],      // 12
];
function parseMonthLabelToYM(label: string | undefined | null): string | null {
  if (!label) return null;
  const low = label.toLowerCase().trim();
  const yearMatch = low.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = yearMatch[1];
  for (let i = 0; i < 12; i++) {
    if (MONTH_PREFIXES_LOWER[i].some(p => low.includes(p))) {
      return `${year}-${String(i + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Технічні properties які НЕ показуємо менеджеру — це service-info
 * (типу валідність viber-номера) не потрібна під час дзвінка.
 * Перевіряємо case-insensitive includes — щоб маневрувати між RU/UA варіантами.
 */
const HIDDEN_PROP_PATTERNS = [
  'viber',  // «Валидный viber номер»
];
function isHiddenProperty(prop: string): boolean {
  const low = prop.toLowerCase();
  return HIDDEN_PROP_PATTERNS.some(p => low.includes(p));
}

/**
 * Об'єднана картка «Інформація по клієнту» — компактна на 1 строчку.
 * Освіта · ✓ Документи · властивості-chips (inline). Технічні properties
 * (viber-валідність тощо) сховані через isHiddenProperty.
 */
function ClientInfoBlock({ clientInfo }: { clientInfo: import('@/lib/mityng-types').ClientInfoFromReport }) {
  const props = (clientInfo.properties ?? []).filter(p => !isHiddenProperty(p));
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Інформація по клієнту
      </h3>
      <div className="glass-card-soft px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Освіта:</span>
          <span className="font-semibold text-[13px]">{clientInfo.education || '—'}</span>
        </div>
        <span className="text-muted-foreground/30">·</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {clientInfo.documents ? (
            <span className="text-emerald-700 inline-flex items-center gap-1 text-[13px] font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Документи
            </span>
          ) : (
            <span className="text-rose-700 inline-flex items-center gap-1 text-[13px] font-semibold">
              <AlertCircle className="h-3.5 w-3.5" /> Без документів
            </span>
          )}
        </div>
        {props.length > 0 && <span className="text-muted-foreground/30">·</span>}
        {props.map((prop, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emet-blue/8 text-emet-blue text-[11px] font-semibold border border-emet-blue/15">
            <span className="w-1.5 h-1.5 rounded-full bg-emet-blue" />
            {prop}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Блок «Діючі фокуси клієнта» — між «Інформація» і «План×Факт».
 * Показує всі активні фокуси як glass-card-soft рядки з focusName + dates.
 */
function ClientFocusBlock({ focuses }: { focuses: ClientFocusItem[] }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Діючі фокуси клієнта · {focuses.length}
      </h3>
      <div className="space-y-1.5">
        {focuses.map((f, i) => (
          <div key={i} className="glass-card-soft p-3 grid grid-cols-[8px_minmax(0,1fr)_auto] gap-3 items-center">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <p className="text-[13px] font-semibold leading-snug">{f.focusName}</p>
            {(f.since || f.validUntil) && (
              <p className="text-[10px] text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                {f.since || '?'} → {f.validUntil || 'безстроково'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Історія покупок по брендах — таблиця у тому ж стилі що План×Факт.
 *
 * Виключаємо поточний місяць — він вже у блоку «План × Факт цього місяця».
 * Місяці сортуємо хронологічно asc (старіші ліворуч → свіжі праворуч).
 * Заголовок адаптивний: показує реальну кількість попередніх місяців
 * які 1С повернула (зараз 3, після розширення Action D — 6).
 *
 * Біля кожного бренду — позначка «В плануванні» (emet-blue) або
 * «Немає в плануванні» (slate). Враховує бренд-аліаси: Vitaran-sub-brands
 * та IUSE-sub-brands мапляться через canonicalSegmentCode().
 *
 * Для матчингу плану по бренду — 1С повертає brand-name (не code), тому
 * порівнюємо через нормалізовану форму назви.
 */
function ThreeMonthHistory({ salesReport, yearlySalesReport, planBrands }: {
  salesReport: import('@/lib/mityng-types').ClientReport['salesReport'] | undefined;
  yearlySalesReport: import('@/lib/mityng-types').ClientReport['yearlySalesReport'];
  planBrands: Record<string, number>;
}) {
  // Пріоритет: yearlySalesReport (12 міс) → fallback salesReport (3 міс).
  const sourceBrands = yearlySalesReport?.brands ?? salesReport?.brands ?? [];
  const currentYM = currentYearMonth();
  const MAX_MONTHS = 6;

  // КРОК 1: збираємо усі унікальні місяці з усіх брендів (БЕЗ поточного)
  // КРОК 2: сортуємо ГЛОБАЛЬНО + беремо останні 6 (не per-brand!)
  // Інакше різні бренди дають різні місяці → колонок виходить більше 6.
  const allMonthsSet = new Set<string>();
  for (const b of sourceBrands) {
    for (const m of (b.salesByMonth ?? [])) {
      if (parseMonthLabelToYM(m.month) !== currentYM) {
        allMonthsSet.add(m.month);
      }
    }
  }
  const sortedAllMonths = Array.from(allMonthsSet).sort((a, b) => {
    const ymA = parseMonthLabelToYM(a) ?? '';
    const ymB = parseMonthLabelToYM(b) ?? '';
    return ymA.localeCompare(ymB); // asc — старіші ліворуч
  });
  const lastSixMonths = sortedAllMonths.slice(-MAX_MONTHS);
  const allowedMonths = new Set(lastSixMonths);

  // КРОК 3: фільтруємо бренди — лишаємо тільки ті місяці що у allowedMonths
  const brands = sourceBrands.map(b => {
    const filtered = (b.salesByMonth ?? []).filter(m => allowedMonths.has(m.month));
    const total = filtered.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    return { ...b, salesByMonth: filtered, totalAmount: total };
  }).filter(b => b.totalAmount > 0);

  // Нормалізуємо planBrands ключі через canonicalSegmentCode (Vitaran Cosmetics→OTHER, etc.)
  const planSet = useMemo(() => {
    const s = new Set<string>();
    for (const k of Object.keys(planBrands)) {
      if ((planBrands[k] ?? 0) > 0) s.add(canonicalSegmentCode(k));
    }
    return s;
  }, [planBrands]);

  // Helper: чи цей бренд є у плануванні?
  const isBrandInPlan = (brandName: string): boolean => {
    return planSet.has(canonicalSegmentCode(brandName));
  };

  if (brands.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Покупки попередніх місяців
        </h3>
        <p className="text-[12px] text-muted-foreground">Покупок за попередні місяці не було.</p>
      </div>
    );
  }

  // monthOrder уже готовий = lastSixMonths (топ-6 unique sorted asc)
  const monthOrder = lastSixMonths;

  const sorted = [...brands].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));

  // Адаптивний заголовок: показуємо реальну кількість місяців
  const monthsCount = monthOrder.length;
  const monthsLabel = monthsCount === 1 ? '1 попередній місяць'
    : monthsCount < 5 ? `${monthsCount} попередні місяці`
    : `${monthsCount} попередніх місяців`;

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Покупки {monthsLabel}
      </h3>
      <div className="space-y-1.5">
        {sorted.map(b => {
          const byMonth = Object.fromEntries(b.salesByMonth.map(m => [m.month, m.amount]));
          const inPlan = isBrandInPlan(b.brandName);
          return (
            <div
              key={b.brandName}
              className="glass-card-soft p-3 grid items-center gap-3"
              style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${monthOrder.length}, 1fr) 90px 120px` }}
            >
              <div className="font-semibold text-[13px] truncate flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${inPlan ? 'bg-emet-blue' : 'bg-slate-400'}`} />
                {cleanBrandName(b.brandName)}
              </div>
              {monthOrder.map(m => {
                const amount = byMonth[m] ?? 0;
                return (
                  <div key={m} className="text-right">
                    <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-none">{m}</p>
                    <p className={`font-mono font-bold tabular-nums text-[12px] mt-1 leading-none amount ${amount > 0 ? '' : 'text-muted-foreground/40'}`}>
                      {amount > 0 ? `$${Math.round(amount).toLocaleString('en-US')}` : '—'}
                    </p>
                  </div>
                );
              })}
              <div className="text-right border-l border-white/50 pl-3">
                <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-none">Всього</p>
                <p className="font-mono font-bold tabular-nums text-[14px] mt-1 leading-none amount">
                  ${Math.round(b.totalAmount || 0).toLocaleString('en-US')}
                </p>
              </div>
              {/* Позначка чи бренд у плануванні цього місяця */}
              <div className="flex justify-end">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap backdrop-blur-sm ${
                  inPlan
                    ? 'bg-emet-blue/10 text-emet-blue border border-emet-blue/20'
                    : 'bg-slate-400/10 text-slate-500 border border-slate-300/50'
                }`}>
                  {inPlan ? 'В плануванні' : 'Немає в плані'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Hybrid events block (узгоджено з користувачем 2026-05-27):
 *  - Ліва колонка (2fr): Зустрічі + Дзвінки з tab-фільтром.
 *    За замовч — тільки поточний місяць. Кнопка «Показати всю історію»
 *    відкриває V3-стайл monthly timeline.
 *  - Права колонка (1fr): Семінари — ВСІ показуємо (рідкісна подія).
 *
 * На вузьких екранах (sm/md) — стек у одну колонку.
 */

type EventType = 'meeting' | 'call' | 'seminar';
type TimelineEvent = { date: string; comment: string; type: EventType };
type CallMeetingFilter = 'all' | 'meeting' | 'call';

const UA_MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
function formatMonthLabel(yyyymm: string): string {
  const [y, mStr] = yyyymm.split('-');
  const m = parseInt(mStr, 10);
  return (UA_MONTHS[m - 1] || mStr) + ' ' + y;
}
function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function EventsTimeline({ meetings, calls, seminars, totalCount }: {
  meetings: { date: string; comment: string }[];
  calls: { date: string; comment: string }[];
  seminars: { date: string; comment: string }[];
  totalCount: number;
}) {
  const [filter, setFilter] = useState<CallMeetingFilter>('all');
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // === Об'єднуємо зустрічі+дзвінки, sort desc ===
  const meetingsAndCalls: TimelineEvent[] = useMemo(() => {
    const all: TimelineEvent[] = [];
    for (const e of meetings) all.push({ ...e, type: 'meeting' });
    for (const e of calls) all.push({ ...e, type: 'call' });
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [meetings, calls]);

  // Filter по tab
  const filtered = useMemo(() => {
    if (filter === 'all') return meetingsAndCalls;
    return meetingsAndCalls.filter(e => e.type === filter);
  }, [meetingsAndCalls, filter]);

  // === Поточний місяць vs історія ===
  const ym = currentYearMonth();
  const currentMonth = useMemo(() => filtered.filter(e => (e.date || '').slice(0, 7) === ym), [filtered, ym]);
  const history = useMemo(() => filtered.filter(e => (e.date || '').slice(0, 7) !== ym), [filtered, ym]);

  // Групуємо історію по місяцях
  const historyByMonth = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    for (const e of history) {
      const k = (e.date || '').slice(0, 7) || 'unknown';
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  // Семінари — sort desc
  const sortedSeminars = useMemo(
    () => [...seminars].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [seminars],
  );

  // Empty state
  if (totalCount === 0) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Події
        </h3>
        <p className="text-[12px] text-muted-foreground">Зустрічей, дзвінків і семінарів не зафіксовано.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header з лічильниками */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
          Події · {totalCount}
        </h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3 text-emet-blue" /> {meetings.length}
          <span className="text-muted-foreground/30">·</span>
          <Phone className="h-3 w-3 text-emerald-600" /> {calls.length}
          <span className="text-muted-foreground/30">·</span>
          <GraduationCap className="h-3 w-3 text-violet-600" /> {seminars.length}
        </span>
      </div>

      {/* 2-колоночна сітка: зустрічі+дзвінки (2fr) | семінари (1fr) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">

        {/* === ЛІВА КОЛОНКА: Зустрічі + Дзвінки === */}
        <div className="glass-card-soft p-3">
          {/* Tabs */}
          <div className="flex gap-1.5 mb-2 flex-wrap">
            <TabBtn active={filter === 'all'} onClick={() => setFilter('all')} count={meetingsAndCalls.length}>Усі</TabBtn>
            <TabBtn active={filter === 'meeting'} onClick={() => setFilter('meeting')} count={meetings.length} icon={<Calendar className="h-3 w-3" />} color="emet">Зустрічі</TabBtn>
            <TabBtn active={filter === 'call'} onClick={() => setFilter('call')} count={calls.length} icon={<Phone className="h-3 w-3" />} color="emerald">Дзвінки</TabBtn>
          </div>

          {/* Поточний місяць — за замовч завжди видно */}
          <p className="text-[10px] uppercase tracking-[0.08em] font-extrabold text-emet-blue mt-3 mb-1.5 px-1.5">
            {formatMonthLabel(ym)} · {currentMonth.length} {currentMonth.length === 1 ? 'подія' : currentMonth.length < 5 ? 'події' : 'подій'}
          </p>
          {currentMonth.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic px-3 py-2">
              У цьому місяці контактів ще не зафіксовано.
            </p>
          ) : (
            <ol>
              {currentMonth.map((e, i) => <EventCompactRow key={`cm-${i}`} event={e} />)}
            </ol>
          )}

          {/* Кнопка-розгортання історії */}
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setHistoryExpanded(s => !s)}
              className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-1.5 rounded-full bg-emet-blue/8 hover:bg-emet-blue/15 border border-emet-blue/15 text-emet-blue text-[11px] font-bold transition-all hover:-translate-y-px"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${historyExpanded ? 'rotate-180' : ''}`} />
              {historyExpanded ? 'Згорнути історію' : `Показати всю історію (${history.length})`}
            </button>
          )}

          {/* V3-style monthly timeline історії */}
          {historyExpanded && historyByMonth.length > 0 && (
            <div className="mt-3 space-y-2">
              {historyByMonth.map(([month, evs]) => (
                <div key={month}>
                  <div className="flex items-center gap-2.5 my-1 px-1.5">
                    <span className="text-[9px] uppercase tracking-[0.08em] font-extrabold text-emet-blue whitespace-nowrap">
                      {formatMonthLabel(month)}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground font-bold px-1.5 py-0.5 rounded-full bg-emet-blue/8">
                      {evs.length}
                    </span>
                    <span className="flex-1 h-px bg-gradient-to-r from-emet-blue/20 to-transparent" />
                  </div>
                  <ol>
                    {evs.map((e, i) => <EventCompactRow key={`h-${month}-${i}`} event={e} />)}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* === ПРАВА КОЛОНКА: Семінари (завжди ВСІ) === */}
        <div className="glass-card-soft p-3">
          <div className="flex items-center gap-2 mb-2 px-1.5">
            <GraduationCap className="h-4 w-4 text-violet-600" />
            <p className="text-[11px] uppercase tracking-wider font-extrabold text-violet-600">
              Семінари · {sortedSeminars.length}
            </p>
          </div>
          {sortedSeminars.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic px-3 py-2">
              Семінарів не зафіксовано.
            </p>
          ) : (
            <ol className="space-y-1">
              {sortedSeminars.map((e, i) => <SeminarRow key={`s-${i}`} event={e} currentYM={ym} />)}
            </ol>
          )}
        </div>

      </div>
    </div>
  );
}

/** Tab-кнопка для зустрічі/дзвінки фільтру. */
function TabBtn({ active, onClick, count, icon, color, children }: {
  active: boolean; onClick: () => void; count: number;
  icon?: React.ReactNode; color?: 'emet' | 'emerald';
  children: React.ReactNode;
}) {
  const iconColorClass = color === 'emerald' ? 'text-emerald-600' : color === 'emet' ? 'text-emet-blue' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
        active
          ? 'bg-emet-blue text-white border border-emet-blue'
          : 'bg-transparent border border-transparent text-muted-foreground hover:bg-white/55'
      }`}
    >
      {icon && <span className={active ? '' : iconColorClass}>{icon}</span>}
      <span>{children}</span>
      <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
        active ? 'bg-white/25 text-white' : 'bg-emet-blue/10 text-emet-blue'
      }`}>
        {count}
      </span>
    </button>
  );
}

/** Компактний рядок події (зустріч/дзвінок) — для поточного місяця + історії. */
function EventCompactRow({ event }: { event: TimelineEvent }) {
  const META = {
    meeting: { Icon: Calendar, label: 'Зустріч', color: 'text-emet-blue' },
    call:    { Icon: Phone,    label: 'Дзвінок', color: 'text-emerald-600' },
    seminar: { Icon: GraduationCap, label: 'Семінар', color: 'text-violet-600' },
  } as const;
  const m = META[event.type];
  return (
    <li className="grid grid-cols-[14px_70px_minmax(56px,auto)_minmax(0,1fr)] gap-3 items-center px-3 py-1.5 rounded-lg hover:bg-white/45 transition-colors">
      <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
      <span className="font-mono tabular-nums text-[11px] text-muted-foreground">{event.date}</span>
      <span className={`text-[10px] font-extrabold uppercase tracking-[0.04em] ${m.color}`}>{m.label}</span>
      <span className="text-[12px] text-foreground truncate">
        {event.comment || <span className="text-muted-foreground/60 italic">Без коментаря</span>}
      </span>
    </li>
  );
}

/** Семінар-рядок — на правій колонці. Більше повітря, бо менше штук. */
function SeminarRow({ event, currentYM }: { event: { date: string; comment: string }; currentYM: string }) {
  const isCurrent = (event.date || '').slice(0, 7) === currentYM;
  return (
    <li className="px-3 py-2 rounded-lg hover:bg-white/45 transition-colors">
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums text-[11px] text-muted-foreground">{event.date}</span>
        {isCurrent && (
          <span className="text-[8px] font-extrabold uppercase tracking-[0.06em] text-violet-700 bg-violet-500/12 border border-violet-300/40 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
            Цей місяць
          </span>
        )}
      </div>
      <p className="text-[12px] text-foreground leading-snug mt-1">
        {event.comment || <span className="text-muted-foreground/60 italic">Без коментаря</span>}
      </p>
    </li>
  );
}

/**
 * Per-brand розбивка План × Факт × Викон. для розгорнутого клієнта.
 *
 * Об'єднує бренди з планByClient[clientId].brands (наш Supabase) та
 * factByClient[clientId].brands (1С getSalesFact). Для кожного бренду:
 *  - План  > 0 + Факт > 0   → нормальний рядок зі статусом
 *  - План  > 0 + Факт = 0   → 🔥 «не куплено» (треба дзвонити)
 *  - План = 0 + Факт > 0   → ⚡ «купив без плану» (можна додати наступним місяцем)
 *
 * Sort: спочатку рядки з планом, далі купівлі без плану, у межах — по сумі desc.
 */
function PlanFactByBrand({ planBrands, factBrands }: {
  planBrands: Record<string, number>;
  factBrands: Record<string, number>;
}) {
  // Нормалізуємо коди (ДРУГИЕ ТМ → OTHER тощо) і агрегуємо суми
  const normalizedPlan = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(planBrands)) {
      const c = canonicalSegmentCode(k);
      out[c] = (out[c] ?? 0) + (Number(v) || 0);
    }
    return out;
  }, [planBrands]);
  const normalizedFact = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(factBrands)) {
      const c = canonicalSegmentCode(k);
      out[c] = (out[c] ?? 0) + (Number(v) || 0);
    }
    return out;
  }, [factBrands]);

  // Об'єднуємо канонічні ключі з обох джерел
  const allCodes = useMemo(() => {
    const set = new Set<string>([...Object.keys(normalizedPlan), ...Object.keys(normalizedFact)]);
    return Array.from(set);
  }, [normalizedPlan, normalizedFact]);

  // Зібрані рядки + сортування
  const rows = useMemo(() => {
    return allCodes.map(code => {
      const plan = normalizedPlan[code] ?? 0;
      const fact = normalizedFact[code] ?? 0;
      const pct = plan > 0 ? (fact / plan) * 100 : null;
      const status: 'ok' | 'warn' | 'bad' | 'unplanned' =
        plan === 0 && fact > 0 ? 'unplanned'
        : plan > 0 && fact === 0 ? 'bad'
        : pct !== null && pct >= 80 ? 'ok'
        : 'warn';
      return {
        code,
        name: cleanBrandName(BRAND_NAMES[code] || code),
        plan,
        fact,
        pct,
        status,
      };
    }).sort((a, b) => {
      // Сначала з планом, потім незаплановані купівлі
      const plannedA = a.plan > 0 ? 0 : 1;
      const plannedB = b.plan > 0 ? 0 : 1;
      if (plannedA !== plannedB) return plannedA - plannedB;
      // Усередині — по убутк. величині
      return (b.plan + b.fact) - (a.plan + a.fact);
    });
  }, [allCodes, planBrands, factBrands]);

  if (rows.length === 0) {
    return (
      <div>
        <PlanFactHeader rowsCount={0} />
        <p className="text-[12px] text-muted-foreground">
          Для цього клієнта на поточний місяць нема ні плану, ні фактичних закупівель.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PlanFactHeader rowsCount={rows.length} />
      <div className="space-y-1.5">
        {rows.map(r => (
          <PlanFactBrandRow key={r.code} row={r} />
        ))}
      </div>
    </div>
  );
}

/**
 * Заголовок блока з під-рядком: дата-зріз факту + примітка про поточний місяць.
 * Окремий компонент щоб не дублювати між empty/filled станами.
 */
function PlanFactHeader({ rowsCount }: { rowsCount: number }) {
  // Формуємо «сьогодні» у форматі DD.MM.YYYY (UA)
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  // UA назва поточного місяця для довідки
  const monthLabel = `${UA_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return (
    <div className="mb-2">
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
        План × Факт цього місяця по брендах{rowsCount > 0 ? ` · ${rowsCount}` : ''}
      </h3>
      <p className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
        Факт станом на <span className="font-semibold text-foreground tabular-nums">{today}</span>
        {' · '}поточний місяць ({monthLabel}). Кнопка <strong>LIVE</strong> у хедері змінює тільки швидкість оновлення — діапазон даних завжди «з 1-го по сьогодні».
      </p>
    </div>
  );
}

interface BrandRowData {
  code: string;
  name: string;
  plan: number;
  fact: number;
  pct: number | null;
  status: 'ok' | 'warn' | 'bad' | 'unplanned';
}

function PlanFactBrandRow({ row }: { row: BrandRowData }) {
  const { name, plan, fact, pct, status } = row;
  const STATUS_META = {
    ok:        { dot: 'bg-emerald-500',  label: 'Виконано',           pillBg: 'bg-emerald-500/12 border border-emerald-300/40 text-emerald-700 backdrop-blur-sm' },
    warn:      { dot: 'bg-amber-500',    label: 'В роботі',           pillBg: 'bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm' },
    bad:       { dot: 'bg-rose-500',     label: '🔥 Без закупівлі',   pillBg: 'bg-rose-500/12 border border-rose-300/40 text-rose-700 backdrop-blur-sm' },
    unplanned: { dot: 'bg-violet-500',   label: '⚡ Поза плануванням', pillBg: 'bg-violet-500/12 border border-violet-300/40 text-violet-700 backdrop-blur-sm' },
  } as const;
  const meta = STATUS_META[status];
  return (
    // Фіксовані ширини колонок План/Факт/Викон/Status — щоб усі рядки
    // вирівнювались строго (раніше 1fr+auto давало «гуляючі» значення
    // коли status-pill мав різну довжину).
    <div className="glass-card-soft p-3 grid grid-cols-[12px_minmax(0,1fr)_110px_110px_75px_150px] gap-3 items-center">
      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
      <div className="font-semibold text-[13px] truncate">{name}</div>
      <div className="text-right">
        <p className="text-[9px] uppercase text-muted-foreground font-semibold">План</p>
        <p className="font-mono font-bold tabular-nums text-[12px] mt-0.5 amount">
          {plan > 0 ? `$${Math.round(plan).toLocaleString('en-US')}` : <span className="text-muted-foreground/40">—</span>}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[9px] uppercase text-muted-foreground font-semibold">Факт</p>
        <p className="font-mono font-bold tabular-nums text-[12px] mt-0.5 amount">
          {fact > 0 ? `$${Math.round(fact).toLocaleString('en-US')}` : <span className="text-muted-foreground/40">$0</span>}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[9px] uppercase text-muted-foreground font-semibold">Викон.</p>
        <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 ${
          pct === null ? 'text-muted-foreground/40'
          : pct >= 100 ? 'text-emerald-700'
          : pct >= 80 ? 'text-emerald-600'
          : pct >= 50 ? 'text-amber-600'
          : 'text-rose-600'
        }`}>
          {pct === null ? '—' : `${pct.toFixed(0)}%`}
        </p>
      </div>
      <div className="flex justify-end">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold leading-none whitespace-nowrap ${meta.pillBg}`}>
          {meta.label}
        </span>
      </div>
    </div>
  );
}

