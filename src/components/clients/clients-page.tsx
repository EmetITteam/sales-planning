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
import { Search, Phone, Users, CheckCircle2, AlertCircle, ChevronDown, X, Loader2, Calendar, GraduationCap } from 'lucide-react';
import { useMyClients, useClientReport, useClientsTotals, useClientActivities, useClientFocuses, useClientActivationPlan, type ClientFocusItem } from '@/lib/use-my-clients';
import { useAppStore } from '@/lib/store';
import { SEGMENTS } from '@/lib/mock-data';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { useRegistryPlans } from '@/lib/use-registry-plans';
import { adaptRegistryPlans } from '@/lib/onec-adapters';
import { isTrialManager } from '@/lib/trial-manager';
import { NewClientDialog } from './new-client-dialog';
import { GlobalClientSearchDialog } from './global-client-search-dialog';
import { UserPlus } from 'lucide-react';
import { MeetingForm, type MeetingFormData } from '@/components/meetings/meeting-form';

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
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [meetingForClient, setMeetingForClient] = useState<ClientFromOneC | null>(null);

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
  );
  // Контактна активність (зустрічі/дзвінки цього міс) — для Hero Card 4
  const { activityByClient, loading: activitiesLoading } = useClientActivities(sessionUser?.login ?? null, clientIds);

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
  const { data: registryPlansResponse } = useRegistryPlans(
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
              planBrands={planByClient[focusClient.ClientID]?.brands ?? {}}
              factBrands={factByClient[focusClient.ClientID]?.brands ?? {}}
              focuses={focusByClient[focusClient.ClientID] ?? []}
              meetingMissing={meetingMissingClientIds.has(focusClient.ClientID)}
              totalsLoading={totalsLoading}
              expanded={expandedId === focusClient.ClientID}
              onToggle={() => setExpandedId(expandedId === focusClient.ClientID ? null : focusClient.ClientID)}
              onCreateMeeting={(c) => setMeetingForClient(c)}
            />
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
        subtitle={buildHeaderSubtitle(clients.length)}
        onNewClient={() => setNewClientOpen(true)}
        onGlobalSearch={() => setGlobalSearchOpen(true)}
      />

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
                  meetingMissingClientIds={meetingMissingClientIds}
                  totalsLoading={totalsLoading}
                  expandedId={expandedId}
                  onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
                  onCreateMeeting={(c) => setMeetingForClient(c)}
                />
              );
            })}
            {showReserved && (
              <ReservedSection
                clients={reservedClients}
                planByClient={planByClient}
                factByClient={factByClient}
                focusByClient={focusByClient}
                meetingMissingClientIds={meetingMissingClientIds}
                totalsLoading={totalsLoading}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
                onCreateMeeting={(c) => setMeetingForClient(c)}
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

// === Page title ===
function PageTitle({
  subtitle,
  onNewClient,
  onGlobalSearch,
}: {
  subtitle: React.ReactNode;
  onNewClient?: () => void;
  onGlobalSearch?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      <div className="w-10 h-10 rounded-xl bg-emet-blue text-white flex items-center justify-center shadow-[0_4px_12px_rgba(6,106,171,0.25)] shrink-0">
        <Users className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-[18px] font-bold tracking-tight">Клієнти</h1>
        <div className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</div>
      </div>
      {onGlobalSearch && (
        <button
          type="button"
          onClick={onGlobalSearch}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-white/70 border border-emet-blue/25 text-emet-blue text-[13px] font-bold hover:bg-emet-blue hover:text-white hover:border-emet-blue active:translate-y-px transition-all shrink-0"
          aria-label="Пошук по всій базі"
        >
          <Search className="w-4 h-4" />
          <span className="max-sm:hidden">По всій базі</span>
        </button>
      )}
      {onNewClient && (
        <button
          type="button"
          onClick={onNewClient}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.3)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.4)] active:translate-y-px transition-all shrink-0"
          aria-label="Новий клієнт"
        >
          <UserPlus className="w-4 h-4" />
          <span className="max-sm:hidden">Новий клієнт</span>
        </button>
      )}
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
function HeroVykonannya({ index, planTotal, factTotal, pct, calcPct, forecastPct, completedCount, withPlanCount, isTrial }: {
  index: number;
  planTotal: number; factTotal: number; pct: number;
  calcPct: number; forecastPct: number;
  completedCount: number; withPlanCount: number;
  isTrial: boolean;
}) {
  // Trial-новачок: 1С виставила $1-sentinel замість плану → % безглуздий.
  if (isTrial) {
    return (
      <div className={`${heroCardCls} ambient-accent`} style={{ ['--i' as string]: index }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
        </div>
        <p className="text-[36px] font-bold tracking-[-1px] leading-none text-slate-400">—</p>
        <div className="flex flex-col gap-1">
          <span className="inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-400/12 border border-slate-300/50 text-slate-600 backdrop-blur-sm">Новачок</span>
          <p className="text-[11px] text-muted-foreground leading-snug">1С ще не виставила план — менеджер на випробувальному. Факт: <span className="amount font-semibold text-foreground">{fmtUSD(factTotal)}</span></p>
        </div>
      </div>
    );
  }
  let pctColor = 'text-rose-600';
  if (pct >= 100) pctColor = 'text-emerald-700';
  else if (pct >= calcPct) pctColor = 'text-emerald-600';
  else if (pct >= calcPct - 10) pctColor = 'text-amber-600';
  // Темп має свій traffic-light окремо
  let forecastColor = 'text-rose-600';
  if (forecastPct >= 100) forecastColor = 'text-emerald-700';
  else if (forecastPct >= 80) forecastColor = 'text-amber-600';
  // Клієнти що виконали запланований обсяг продажів (fact ≥ план по клієнту).
  const execPct = withPlanCount > 0 ? Math.round((completedCount / withPlanCount) * 100) : 0;
  const execColor = execPct >= 80 ? 'text-emerald-600' : execPct >= 50 ? 'text-amber-600' : 'text-rose-600';
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
      {/* Клієнти що виконали запланований обсяг продажів (fact ≥ план по клієнту) */}
      <div className="pt-2 border-t border-slate-200/50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold font-mono tabular-nums">{completedCount}<span className="text-muted-foreground font-normal"> / {withPlanCount}</span></span>
          <span className={`text-[12px] font-bold ${execColor}`}>{execPct}%</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">клієнтів виконали запланований обсяг продажів</p>
      </div>
    </div>
  );
}

/** Card 2 — База клієнтів (категорії: всього + купили цього міс + резерв). */
function HeroBaza({ index, baseTotal, counts, boughtByCategory, totalBought, reservedCount, reservedActiveCount }: {
  index: number; baseTotal: number;
  counts: Record<UICategory, number>;
  boughtByCategory: Record<UICategory, number>;
  totalBought: number;
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
        {/* header колонок: всього у базі / скільки купили цього міс */}
        <div className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 text-[9px] uppercase tracking-wider text-muted-foreground/70">
          <span /><span />
          <span className="text-right">база</span>
          <span className="text-right">купили</span>
        </div>
        {visibleCats.filter(c => counts[c] > 0).map(c => (
          <div key={c} className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 items-center">
            <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[c].dot}`} />
            <span className="text-foreground">{CAT_LABEL[c]}</span>
            <span className="font-mono font-bold tabular-nums text-right">{counts[c]}</span>
            <span className="font-mono font-bold tabular-nums text-right text-emerald-600">{boughtByCategory[c] ?? 0}</span>
          </div>
        ))}
        {reservedCount > 0 && (
          <div className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 items-center text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Резерв</span>
            <span className="font-mono font-bold tabular-nums text-right">{reservedCount}</span>
            <span className="font-mono font-bold tabular-nums text-right text-emerald-600">{reservedActiveCount}</span>
          </div>
        )}
        {/* Разом купили цього місяця */}
        <div className="grid grid-cols-[8px_1fr_3.25rem_3.25rem] gap-x-2 items-center pt-1 mt-1 border-t border-white/40 font-bold">
          <span /><span className="text-foreground">Разом купили</span>
          <span />
          <span className="font-mono tabular-nums text-right text-emerald-600">{totalBought}</span>
        </div>
      </div>
    </div>
  );
}

/** Card 3 — План активації бази (Action B): план з 1С vs факт активовано. */
function HeroActivation({ index, rows, planSum, activatedSum, hasDoc, withPlanCount, focusedCount, activeFilter, onFilterChange }: {
  index: number;
  rows: Array<{ uiCat: string; label: string; dotClass: string; planCount: number; activated: number }>;
  planSum: number;
  activatedSum: number;
  hasDoc: boolean;
  withPlanCount: number;
  focusedCount: number;
  activeFilter: string;
  onFilterChange: (f: 'all' | 'focused' | 'with-plan') => void;
}) {
  const pct = planSum > 0 ? Math.round((activatedSum / planSum) * 100) : 0;
  let pctColor = 'text-rose-600';
  if (pct >= 80) pctColor = 'text-emerald-600';
  else if (pct >= 50) pctColor = 'text-amber-600';
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
function HeroContacts({ index, loading, baseTotal, withCall, withMeeting, coveragePct, noContacts, noContactsWithPlan, noContactsWithoutPlan }: {
  index: number; loading: boolean; baseTotal: number;
  withCall: number; withMeeting: number;
  coveragePct: number; noContacts: number;
  noContactsWithPlan: number; noContactsWithoutPlan: number;
}) {
  let pctColor = 'text-rose-600';
  if (coveragePct >= 80) pctColor = 'text-emerald-600';
  else if (coveragePct >= 50) pctColor = 'text-amber-600';
  // Поки активності вантажаться (3 чанки 1С) — activityByClient неповний, тож
  // «без контактів» рахувало б усю базу як red. Показуємо лоадер, не цифри.
  const amb = loading ? 'accent' : coveragePct >= 80 ? 'good' : coveragePct >= 50 ? 'warn' : 'bad';
  return (
    <div className={`${heroCardCls} ambient-${amb}`} style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#d97706]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Контактна активність</p>
      </div>
      {loading ? (
        <div className="py-2">
          <p className="text-[36px] font-bold tracking-[-1px] leading-none text-slate-300 animate-pulse">—</p>
          <p className="text-[10px] text-muted-foreground mt-2">рахуємо контактну активність…</p>
        </div>
      ) : (<>
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
      </>)}
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
  cat, clients, planByClient, factByClient, focusByClient, meetingMissingClientIds, totalsLoading, expandedId, onToggleExpand, onCreateMeeting,
}: {
  cat: UICategory; clients: ClientFromOneC[];
  planByClient: Record<string, { planTotal: number; brands: Record<string, number> }>;
  factByClient: Record<string, { factTotal: number; brands: Record<string, number> }>;
  focusByClient: Record<string, ClientFocusItem[]>;
  meetingMissingClientIds: Set<string>;
  totalsLoading: boolean;
  expandedId: string | null; onToggleExpand: (id: string) => void;
  onCreateMeeting?: (client: ClientFromOneC) => void;
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
              meetingMissing={meetingMissingClientIds.has(c.ClientID)}
              totalsLoading={totalsLoading}
              expanded={expandedId === c.ClientID}
              onToggle={() => onToggleExpand(c.ClientID)}
              onCreateMeeting={onCreateMeeting}
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
function ReservedSection({ clients, planByClient, factByClient, focusByClient, meetingMissingClientIds, totalsLoading, expandedId, onToggleExpand, onCreateMeeting }: {
  clients: ClientFromOneC[];
  planByClient: Record<string, { planTotal: number; brands: Record<string, number> }>;
  factByClient: Record<string, { factTotal: number; brands: Record<string, number> }>;
  focusByClient: Record<string, ClientFocusItem[]>;
  meetingMissingClientIds: Set<string>;
  totalsLoading: boolean;
  expandedId: string | null; onToggleExpand: (id: string) => void;
  onCreateMeeting?: (client: ClientFromOneC) => void;
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
                meetingMissing={meetingMissingClientIds.has(c.ClientID)}
                totalsLoading={totalsLoading}
                expanded={expandedId === c.ClientID}
                onToggle={() => onToggleExpand(c.ClientID)}
                onCreateMeeting={onCreateMeeting}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// === One client row with accordion-expand ===
function ClientRow({ client, plan, fact, planBrands, factBrands, focuses, meetingMissing, totalsLoading, expanded, onToggle, onCreateMeeting }: {
  client: ClientFromOneC;
  plan: number | null;
  fact: number | null;
  planBrands: Record<string, number>;
  factBrands: Record<string, number>;
  focuses: ClientFocusItem[];
  /** У плані поточного місяця stage='Зустріч', але реальної події у 1С ще нема. */
  meetingMissing?: boolean;
  totalsLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCreateMeeting?: (client: ClientFromOneC) => void;
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
    <div data-client-row={client.ClientID} className={`glass-card-flat overflow-hidden ${dimmedRow ? 'opacity-70' : ''}`}>
      {/* HTML забороняє button-в-button — а нам треба фон-toggle + внутрішні
          tel/«Запланувати зустріч» дії. Тому outer = div role="button" з
          keyboard support, а inner phone/calendar лишаються справжніми
          <a>/<button> й працюють як треба. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
        className="w-full grid grid-cols-[36px_minmax(0,1fr)_auto] md:grid-cols-[40px_minmax(0,1.6fr)_85px_85px_70px_24px] gap-3.5 md:gap-4 items-center px-3 md:px-4 py-3 hover:bg-white/40 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40"
      >
        {/* Avatar — 36px mobile / 40px desktop. */}
        <div className={`flex w-9 md:w-10 h-9 md:h-10 rounded-xl bg-emet-50 ${CAT_COLOR[cat].text} items-center justify-center text-[11px] md:text-[12px] font-bold shrink-0 mt-0.5 md:mt-0`}>
          {initials(name)}
        </div>

        {/* Name + UA-category-chip | address · phone.
            На мобільному (max-md): name окремим рядком, а chips переносимо
            нижче — інакше «Активний» chip перекриває truncated ім'я. */}
        <div className="min-w-0">
          {/* Mobile: ПІБ на 2 рядки + chips новим рядком нижче.
              Desktop: ПІБ + chips inline в одному рядку (з wrap). */}
          <div className="md:flex md:items-center md:gap-2 md:flex-wrap min-w-0">
          <p className="text-[14px] font-bold md:truncate line-clamp-2 md:line-clamp-none leading-tight min-w-0">{name || '— без назви —'}</p>
          <div className="flex items-center gap-1.5 mt-1 md:mt-0 min-w-0 flex-wrap">
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
            {/* Meeting-missing-tag (amber) — у плані Зустріч, але події ще нема.
                Підказка щоб менеджер натиснув «Запланувати зустріч» (поряд). */}
            {meetingMissing && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-amber-500/12 text-amber-700 border border-amber-300/50 backdrop-blur-sm"
                title="У плані стоїть етап «Зустріч», але точну дату й час ще не заплановано."
              >
                <Calendar className="w-2.5 h-2.5" />
                Зустріч без дати
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
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 min-w-0">
            {address && <span className="truncate">{address}</span>}
            {/* Desktop: текстовий номер як link (старий вигляд) */}
            {client.Phone && (
              <>
                {address && <span className="text-muted-foreground/40 shrink-0 hidden md:inline">·</span>}
                <a
                  href={`tel:${phoneClean}`}
                  onClick={e => e.stopPropagation()}
                  className="hidden md:inline-flex items-center gap-1 hover:text-emet-blue transition-colors shrink-0"
                >
                  <Phone className="h-3 w-3" />
                  <span className="tabular-nums">{client.Phone}</span>
                </a>
              </>
            )}
            {/* Desktop text-link — «Запланувати зустріч» */}
            {onCreateMeeting && (
              <>
                {(address || client.Phone) && (
                  <span className="text-muted-foreground/40 shrink-0 hidden md:inline">·</span>
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onCreateMeeting(client);
                  }}
                  className="hidden md:inline-flex items-center gap-1 text-emet-blue hover:text-emet-blue-light font-semibold shrink-0"
                >
                  <Calendar className="h-3 w-3" />
                  Запланувати зустріч
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile-only icon-кнопки: phone + create meeting у одному контейнері.
            Quadratic-style (rounded-[10px]) щоб не конфліктували з round phone-call
            на /meetings — тут вони у читаючому контексті, не CTA. */}
        <div className="md:hidden inline-flex items-center gap-1.5 shrink-0">
          {client.Phone && (
            <a
              href={`tel:${phoneClean}`}
              onClick={e => e.stopPropagation()}
              aria-label={`Подзвонити ${name}`}
              title={client.Phone}
              className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-white/70 backdrop-blur-md border border-emet-blue/25 text-emet-blue hover:bg-emet-blue hover:text-white shadow-sm active:scale-95 transition-all"
            >
              <Phone className="w-[15px] h-[15px]" />
            </a>
          )}
          {onCreateMeeting && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCreateMeeting(client);
              }}
              aria-label={`Запланувати зустріч з ${name}`}
              title="Запланувати зустріч"
              className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-white/70 backdrop-blur-md border border-emet-blue/25 text-emet-blue hover:bg-emet-blue hover:text-white shadow-sm active:scale-95 transition-all"
            >
              <Calendar className="w-[15px] h-[15px]" />
            </button>
          )}
        </div>

        {/* План / Факт / % — desktop only. */}
        <NumCol label="План" value={plan} loading={totalsLoading} emptyAs={hasFact ? 'zero' : null} />
        <NumCol label="Факт" value={fact} loading={totalsLoading} emptyAs="zero" />
        <PctCol pct={pct} loading={totalsLoading} disabled={!hasPlan} />

        {/* Desktop chevron — візуальний натяк що рядок розгортається. */}
        <ChevronDown className={`hidden md:block h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
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

  // Статичне вікно: 6 ПОСЛІДОВНИХ місяців ДО поточного (без нього), asc.
  // Раніше бралися лише місяці що 1С повернула → колонки виходили розріджені
  // (травень, червень, вересень, березень...) ще й RU-назвами. Тепер фіксований
  // піврічний ряд; місяць без покупок = $0.
  const monthOrder = lastNMonthsBefore(currentYM, MAX_MONTHS);
  const windowSet = new Set(monthOrder);

  // Кожен бренд: сума по YM у межах вікна (0 якщо місяця нема у даних 1С).
  const brands = sourceBrands.map(b => {
    const byYM: Record<string, number> = {};
    for (const m of (b.salesByMonth ?? [])) {
      const ym = parseMonthLabelToYM(m.month);
      if (ym && windowSet.has(ym)) byYM[ym] = (byYM[ym] ?? 0) + (Number(m.amount) || 0);
    }
    const total = monthOrder.reduce((s, ym) => s + (byYM[ym] ?? 0), 0);
    return { ...b, byYM, totalAmount: total };
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

  const sorted = [...brands].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
        Покупки за останні 6 місяців
      </h3>
      <div className="space-y-1.5">
        {sorted.map(b => {
          const byMonth = b.byYM;
          const inPlan = isBrandInPlan(b.brandName);
          const total = Math.round(b.totalAmount || 0);
          const planPill = (
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
              inPlan
                ? 'bg-emet-blue/10 text-emet-blue border border-emet-blue/20'
                : 'bg-slate-400/10 text-slate-500 border border-slate-300/50'
            }`}>
              {inPlan ? 'В плані' : 'Немає в плані'}
            </span>
          );
          return (
            <div key={b.brandName} className="glass-card-soft p-3">
              {/* MOBILE: brand + статус + total зверху, місяці inline-list
                  показуються ТІЛЬКИ якщо є покупка — пусті «—» прибрано щоб
                  картка не виглядала роз'єднано і не «літали» цифри у пустоті. */}
              <div className="md:hidden">
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${inPlan ? 'bg-emet-blue' : 'bg-slate-400'}`} />
                  <span className="font-semibold text-[13px] truncate min-w-0">{cleanBrandName(b.brandName)}</span>
                  {!inPlan && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-400/10 text-slate-500 border border-slate-300/50">
                      не в плані
                    </span>
                  )}
                  <span className="ml-auto font-mono font-bold tabular-nums text-[13px] shrink-0 amount">${total.toLocaleString('en-US')}</span>
                </div>
                {(() => {
                  const purchases = monthOrder
                    .map(m => ({ month: m, amount: byMonth[m] ?? 0 }))
                    .filter(p => p.amount > 0);
                  if (purchases.length === 0) {
                    return (
                      <div className="pl-4 text-[11px] text-muted-foreground/60">
                        За 6 місяців покупок не зафіксовано.
                      </div>
                    );
                  }
                  // Фіксовані 3 колонки — місяці вирівнюються один під одним
                  // незалежно від довжини сум; решта рядка лишається пустою
                  // без «з'їжджаючого» тексту.
                  return (
                    <div className="pl-4 grid grid-cols-3 gap-x-3 gap-y-1.5">
                      {purchases.map(p => (
                        <div key={p.month} className="flex flex-col leading-none">
                          <span className="text-[9px] uppercase text-muted-foreground font-semibold">{fmtYMShort(p.month)}</span>
                          <span className="font-mono font-bold tabular-nums text-[12px] mt-1 amount">${Math.round(p.amount).toLocaleString('en-US')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* DESKTOP: original grid */}
              <div
                className="hidden md:grid items-center gap-3"
                style={{ gridTemplateColumns: `minmax(160px,1.4fr) repeat(${monthOrder.length}, minmax(70px,1fr)) 90px 120px` }}
              >
                <div className="font-semibold text-[13px] truncate flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${inPlan ? 'bg-emet-blue' : 'bg-slate-400'}`} />
                  {cleanBrandName(b.brandName)}
                </div>
                {monthOrder.map(m => {
                  const amount = byMonth[m] ?? 0;
                  return (
                    <div key={m} className="text-right">
                      <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-none">{fmtYMShort(m)}</p>
                      <p className={`font-mono font-bold tabular-nums text-[12px] mt-1 leading-none amount ${amount > 0 ? '' : 'text-muted-foreground/40'}`}>
                        {amount > 0 ? `$${Math.round(amount).toLocaleString('en-US')}` : '—'}
                      </p>
                    </div>
                  );
                })}
                <div className="text-right border-l border-white/50 pl-3">
                  <p className="text-[9px] uppercase text-muted-foreground font-semibold leading-none">Всього</p>
                  <p className="font-mono font-bold tabular-nums text-[14px] mt-1 leading-none amount">
                    ${total.toLocaleString('en-US')}
                  </p>
                </div>
                <div className="flex justify-end">{planPill}</div>
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

// UA-назва місяця для YYYY-MM (статичні колонки історії покупок).
const UA_MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
function fmtYMShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${UA_MONTHS_SHORT[(m - 1) % 12] ?? '?'} ${y}`;
}
// Останні N ПОСЛІДОВНИХ місяців ДО currentYM (без нього), у порядку asc.
function lastNMonthsBefore(currentYM: string, n: number): string[] {
  const [cy, cm] = currentYM.split('-').map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(cy, (cm - 1) - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
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
      {/* PlanFactBrandRow має mobile-first 2-row compact layout — горизонтальний
          scroll більше не потрібен, картка вписується у 360px viewport. */}
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
  const pctClass = pct === null ? 'text-muted-foreground/40'
    : pct >= 100 ? 'text-emerald-700'
    : pct >= 80 ? 'text-emerald-600'
    : pct >= 50 ? 'text-amber-600'
    : 'text-rose-600';

  const planStr = plan > 0 ? `$${Math.round(plan).toLocaleString('en-US')}` : '—';
  const factStr = fact > 0 ? `$${Math.round(fact).toLocaleString('en-US')}` : '$0';
  const pctStr = pct === null ? '—' : `${pct.toFixed(0)}%`;

  return (
    <div className="glass-card-soft p-3">
      {/* MOBILE: inline-row — dot+brand+chip зверху, дані inline нижче.
          Замість grid 3-col (де метки і цифри плавали окремо) — суцільна
          rядок «План $X · Факт $Y · X%» компактно під брендом. */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
          <span className="font-semibold text-[13px] truncate flex-1 min-w-0">{name}</span>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold leading-none whitespace-nowrap ${meta.pillBg}`}>
            {meta.label}
          </span>
        </div>
        <div className="pl-[18px] text-[11px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-muted-foreground">План</span>
          <span className={`font-mono font-bold tabular-nums text-[12px] amount ${plan === 0 ? 'text-muted-foreground/40' : ''}`}>{planStr}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-muted-foreground">Факт</span>
          <span className={`font-mono font-bold tabular-nums text-[12px] amount ${fact === 0 ? 'text-muted-foreground/40' : ''}`}>{factStr}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className={`font-mono font-bold tabular-nums text-[12px] ${pctClass}`}>{pctStr}</span>
        </div>
      </div>

      {/* DESKTOP: original grid layout */}
      <div className="hidden md:grid grid-cols-[12px_minmax(160px,1fr)_110px_110px_75px_150px] gap-3 items-center">
        <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
        <div className="font-semibold text-[13px] truncate">{name}</div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground font-semibold">План</p>
          <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 amount ${plan === 0 ? 'text-muted-foreground/40' : ''}`}>{planStr}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground font-semibold">Факт</p>
          <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 amount ${fact === 0 ? 'text-muted-foreground/40' : ''}`}>{factStr}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground font-semibold">Викон.</p>
          <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 ${pctClass}`}>{pctStr}</p>
        </div>
        <div className="flex justify-end">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold leading-none whitespace-nowrap ${meta.pillBg}`}>
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}

