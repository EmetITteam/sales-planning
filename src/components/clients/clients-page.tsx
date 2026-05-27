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

import { useMemo, useState } from 'react';
import { Search, Phone, Users, CheckCircle2, AlertCircle, ChevronDown, X, Loader2 } from 'lucide-react';
import { useMyClients, useClientReport, useClientsTotals } from '@/lib/use-my-clients';
import { useAppStore } from '@/lib/store';
import { mapClientCategory } from '@/lib/onec-adapters';
import { MetricCard } from '@/components/dashboard/metric-card';
import { getClientName, getClientAddress, type ClientFromOneC } from '@/lib/mityng-types';

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
  const [activeFilter, setActiveFilter] = useState<UICategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // План (Supabase) + Факт (1С getSalesFact) по всіх клієнтах менеджера
  const clientIds = useMemo(() => clients.map(c => c.ClientID).filter(Boolean), [clients]);
  const { planByClient, factByClient } = useClientsTotals(
    sessionUser?.login ?? null,
    clientIds,
  );

  // === Counts per category ===
  const countsByCategory = useMemo(() => {
    const counts: Record<UICategory, number> = {
      active: 0, sleeping: 0, new: 0, lost: 0, none: 0, missing: 0,
    };
    for (const c of clients) counts[toUICategory(c.ClientCategory)]++;
    return counts;
  }, [clients]);

  // === Filtered + grouped clients ===
  // ⚠️ defensive coding: 1С іноді повертає клієнтів з undefined для
  // clientName/Phone/ClientCategory/clientAddress (виявлено у проді).
  // Скрізь робимо `?? ''` fallback щоб .toLowerCase()/.localeCompare не падали.
  const groupedClients = useMemo(() => {
    const lowSearch = search.trim().toLowerCase();
    const filtered = clients.filter(c => {
      if (activeFilter !== 'all' && toUICategory(c.ClientCategory) !== activeFilter) return false;
      if (!lowSearch) return true;
      const name = getClientName(c).toLowerCase();
      const phone = (c.Phone ?? '').toLowerCase();
      const cat = (c.ClientCategory ?? '').toLowerCase();
      const addr = getClientAddress(c).toLowerCase();
      return name.includes(lowSearch) || phone.includes(lowSearch) || cat.includes(lowSearch) || addr.includes(lowSearch);
    });

    const groups = new Map<UICategory, ClientFromOneC[]>();
    for (const cat of CAT_ORDER) groups.set(cat, []);
    for (const c of filtered) groups.get(toUICategory(c.ClientCategory))!.push(c);
    // sort alphabetically within group — використовуємо getClientName для case-insensitive
    for (const arr of groups.values()) {
      arr.sort((a, b) => getClientName(a).localeCompare(getClientName(b), 'uk'));
    }
    return groups;
  }, [clients, search, activeFilter]);

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
      <PageTitle subtitle={`${clients.length} клієнтів · Травень 2026 · згруповано по категоріях`} />

      {/* === HERO BAND === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          index={0}
          iconColor="text-emet-blue"
          label="Усього клієнтів"
          valueSize="lg"
          value={clients.length}
          caption={<span className="text-muted-foreground">закріплені за вами у 1С</span>}
        />
        <MetricCard
          index={1}
          iconColor="text-emerald-500"
          label="Активні"
          valueSize="lg"
          value={countsByCategory.active}
          caption={
            <span className="text-muted-foreground">
              {clients.length > 0 ? `${((countsByCategory.active / clients.length) * 100).toFixed(0)}%` : '—'} від бази
            </span>
          }
        />
        <MetricCard
          index={2}
          iconColor="text-amber-500"
          label="Зона ризику"
          valueSize="lg"
          value={countsByCategory.sleeping + countsByCategory.lost}
          caption={<span className="text-muted-foreground">сплячі ({countsByCategory.sleeping}) + втрачені ({countsByCategory.lost})</span>}
        />
        <CategoryBreakdownCard counts={countsByCategory} total={clients.length} />
      </div>

      {/* === SEARCH + FILTER PILLS === */}
      <div className="glass-card p-3 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по назві, телефону, місту, категорії…"
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

      {/* === CATEGORY SECTIONS === */}
      {totalFiltered === 0 ? (
        <div className="glass-card p-12 text-center text-[13px] text-muted-foreground">
          {search ? `За запитом «${search}» нічого не знайдено` : 'Немає клієнтів у обраному фільтрі'}
        </div>
      ) : (
        CAT_ORDER.map(cat => {
          const list = groupedClients.get(cat) || [];
          if (list.length === 0) return null;
          return (
            <CategorySection
              key={cat}
              cat={cat}
              clients={list}
              planByClient={planByClient}
              factByClient={factByClient}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId(prev => prev === id ? null : id)}
            />
          );
        })
      )}
    </div>
  );
}

// === Page title ===
function PageTitle({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-emet-blue text-white flex items-center justify-center shadow-[0_4px_12px_rgba(6,106,171,0.25)]">
        <Users className="h-5 w-5" />
      </div>
      <div>
        <h1 className="text-[18px] font-bold tracking-tight">Мої клієнти</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// === Hero card 4: breakdown за 4 рядки списком ===
function CategoryBreakdownCard({ counts, total }: { counts: Record<UICategory, number>; total: number }) {
  return (
    <div
      className="glass-card p-5 relative min-h-[140px] flex flex-col justify-between gap-3 fade-stagger transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]"
      style={{ ['--i' as string]: 3 }}
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_#8b5cf6]" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">По категоріях</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {(['active', 'sleeping', 'new', 'lost'] as UICategory[]).map(c => {
          const pct = total > 0 ? Math.round((counts[c] / total) * 100) : 0;
          return (
            <div key={c} className="grid grid-cols-[8px_1fr_auto] gap-2 items-center text-[12px]">
              <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[c].dot}`} />
              <span className="text-foreground font-medium">{CAT_LABEL[c]}</span>
              <span className="font-mono font-bold tabular-nums">{counts[c]}<span className="text-muted-foreground font-medium text-[10px] ml-1">{pct}%</span></span>
            </div>
          );
        })}
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
  cat, clients, planByClient, factByClient, expandedId, onToggleExpand,
}: {
  cat: UICategory; clients: ClientFromOneC[];
  planByClient: Record<string, { planTotal: number; brands: Record<string, number> }>;
  factByClient: Record<string, { factTotal: number; brands: Record<string, number> }>;
  expandedId: string | null; onToggleExpand: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-3 px-1 pt-2">
        <span className={`w-2 h-2 rounded-full ${CAT_COLOR[cat].dot}`} />
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.04em]">
          {CAT_LABEL[cat]} <span className="text-muted-foreground font-semibold">· {clients.length}</span>
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {clients.map(c => {
          const plan = planByClient[c.ClientID]?.planTotal ?? null;
          const fact = factByClient[c.ClientID]?.factTotal ?? null;
          return (
            <ClientRow
              key={c.ClientID}
              client={c}
              plan={plan}
              fact={fact}
              expanded={expandedId === c.ClientID}
              onToggle={() => onToggleExpand(c.ClientID)}
            />
          );
        })}
      </div>
    </section>
  );
}

// === One client row with accordion-expand ===
function ClientRow({ client, plan, fact, expanded, onToggle }: {
  client: ClientFromOneC;
  plan: number | null;
  fact: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cat = toUICategory(client.ClientCategory);
  const phoneClean = (client.Phone || '').replace(/[^+\d]/g, '');
  const name = getClientName(client);
  const address = getClientAddress(client);
  const pct: number | null = (plan != null && fact != null && plan > 0)
    ? (fact / plan) * 100
    : null;
  const planTotal = plan;
  const factTotal = fact;

  return (
    <div className="glass-card overflow-hidden">
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

        {/* Name + category-pill | address · phone */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[14px] font-bold truncate">{name || '— без назви —'}</p>
            {/* Chip-категорія — СИРЕ значення з 1С (Активный/Спящий/Новый/Потерянный/Без закупок).
                Якщо поле порожнє у 1С — показуємо warning "Без категорії в 1С". */}
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-white/40 ${CAT_COLOR[cat].text}`}>
              {client.ClientCategory?.trim() || 'Без категорії в 1С'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 min-w-0">
            <span className="truncate">{address || 'Адреса не вказана в 1С'}</span>
            {client.Phone && (
              <>
                <span className="text-muted-foreground/40 shrink-0">·</span>
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

        {/* План / Факт / % — desktop only */}
        <NumCol label="План" value={planTotal} />
        <NumCol label="Факт" value={factTotal} />
        <PctCol pct={pct} />

        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <ClientExpand clientID={client.ClientID} />}
    </div>
  );
}

/** Колонка з $-сумою (План/Факт). Якщо value=null → «—». Лише на md+ */
function NumCol({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="hidden md:block text-right">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">{label}</p>
      <p className="text-[13px] font-bold font-mono tabular-nums mt-1 leading-none whitespace-nowrap amount">
        {value === null ? <span className="text-muted-foreground/50">—</span> : `$${Math.round(value).toLocaleString('en-US')}`}
      </p>
    </div>
  );
}

/** Колонка з % виконання. Кольорує по traffic-light. Лише на md+. */
function PctCol({ pct }: { pct: number | null }) {
  let cls = 'text-muted-foreground/50';
  if (pct !== null) {
    if (pct >= 100) cls = 'text-emerald-700';
    else if (pct >= 80) cls = 'text-emerald-600';
    else if (pct >= 50) cls = 'text-amber-600';
    else cls = 'text-rose-600';
  }
  return (
    <div className="hidden md:block text-right">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">Викон.</p>
      <p className={`text-[13px] font-bold font-mono tabular-nums mt-1 leading-none ${cls}`}>
        {pct === null ? '—' : `${pct.toFixed(0)}%`}
      </p>
    </div>
  );
}

// === Accordion-розгортання з детальним звітом ===
function ClientExpand({ clientID }: { clientID: string }) {
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

  const { clientInfo, salesReport, lastMeetings, lastCalls, lastSeminars } = report;
  const eventCount = (lastMeetings?.length || 0) + (lastCalls?.length || 0) + (lastSeminars?.length || 0);

  return (
    <div className="border-t border-white/50 px-5 py-4 space-y-4">
      {/* Базова інфа: освіта + документи (категорія прибрана — chip вже у рядку клієнта) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
        <InfoCell label="Освіта" value={clientInfo.education || '—'} />
        <InfoCell label="Документи" value={clientInfo.documents ? (
          <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Є</span>
        ) : (
          <span className="text-rose-700">Немає</span>
        )} />
      </div>

      {/* 3-місячна історія по брендах */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Продажі по брендах · {salesReport?.periodStart || '?'} — {salesReport?.periodEnd || '?'}
        </h3>
        {salesReport?.brands?.length ? (
          <div className="space-y-1.5">
            {salesReport.brands.map(b => (
              <BrandSalesRow key={b.brandName} brand={b} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Покупок за останні 3 місяці не було.</p>
        )}
      </div>

      {/* Події */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          Події · {eventCount}
        </h3>
        {eventCount === 0 ? (
          <p className="text-[12px] text-muted-foreground">Зустрічей, дзвінків і семінарів не зафіксовано.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <EventList title="Зустрічі" items={lastMeetings} accent="text-emet-blue" />
            <EventList title="Дзвінки" items={lastCalls} accent="text-emerald-600" />
            <EventList title="Семінари" items={lastSeminars} accent="text-violet-600" />
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glass-card-soft p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
      <p className="text-[13px] font-semibold mt-1">{value}</p>
    </div>
  );
}

function BrandSalesRow({ brand }: { brand: { brandName: string; totalAmount: number; salesByMonth: { month: string; amount: number }[] } }) {
  return (
    <div className="glass-card-soft p-3 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_auto] gap-3 items-center">
      <div className="font-semibold text-[13px] truncate">{brand.brandName}</div>
      <div className="hidden md:flex gap-3 text-[11px]">
        {brand.salesByMonth?.slice(-3).map((m, i) => (
          <div key={i} className="flex flex-col">
            <span className="text-muted-foreground text-[9px] uppercase">{m.month}</span>
            <span className="font-mono font-bold tabular-nums">${m.amount.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>
      <div className="text-right">
        <p className="text-[9px] uppercase text-muted-foreground">Всього</p>
        <p className="font-mono font-bold tabular-nums text-[14px]">${brand.totalAmount.toLocaleString('en-US')}</p>
      </div>
    </div>
  );
}

function EventList({ title, items, accent }: { title: string; items: { date: string; comment: string }[] | undefined; accent: string }) {
  return (
    <div className="glass-card-soft p-3">
      <p className={`text-[10px] uppercase tracking-wider font-bold ${accent} mb-2`}>{title} · {items?.length || 0}</p>
      {items?.length ? (
        <ul className="space-y-2 text-[11px] max-h-[140px] overflow-y-auto">
          {items.slice(0, 5).map((e, i) => (
            <li key={i}>
              <p className="font-semibold tabular-nums">{e.date}</p>
              <p className="text-muted-foreground line-clamp-2">{e.comment || '—'}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Немає</p>
      )}
    </div>
  );
}
