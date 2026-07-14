'use client';

/**
 * TeamMeetingsView — read-only перегляд зустрічей підлеглих для РМ/директора.
 *
 * Доступно тільки коли session.role у [admin, director, rm]. Тягне зустрічі
 * через `useMeetings(range, 'managed')` → API повертає тільки [...managedUsers]
 * (без своїх зустрічей РМ).
 *
 * Картки рендеряться у `MeetingCard` з prop `readOnly`+`managerLabel`:
 *  - сховані дії Розпочати/Завершити/Скасувати/Перенести/Правка/Підсумки
 *  - у шапці видно пілюлька з ім'ям менеджера
 *  - клік на ім'я клієнта → досьє (read-only — ок, інфо для РМ)
 *
 * Filter:
 *  - Date preset (Сьогодні/Тиждень/Місяць/…) як на основному борді
 *  - Status pills (Усі/Заплановані/У роботі/Завершені/Скасовані)
 *  - Manager pill row («Усі / Сирик / Шевченко / …» з session.managedUsers)
 *  - Search (по клієнту/меті/коментарю)
 */

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { MeetingCard } from './meeting-card';
import { MeetingsFilters, type StatusFilter } from './meetings-filters';
import { ClientDossierDialog } from './client-dossier-dialog';
import { useMeetings } from '@/lib/meetings/use-meetings';
import { useMyClients } from '@/lib/use-my-clients';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData } from '@/lib/onec-adapters';
import { MULTI_REGION_RM_OVERRIDES, DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';
import {
  calcDateRange,
  DEFAULT_PRESET,
  type DatePreset,
} from '@/lib/meetings/date-presets';
import { groupMeetingsByDate } from '@/lib/meetings/mock-data';
import { getClientName } from '@/lib/mityng-types';
import { UsersRound, Loader2 } from 'lucide-react';

const MONTH_LABELS = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

function formatGroupDate(d: Date): string {
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

/** Display-name з логіну, якщо адаптер у БД не записав. Login типу
 *  `sm.dnepr2@emet.in.ua` → `sm.dnepr2`. Це fallback — основний шлях має
 *  через `client_name`/`manager_name` snapshot у БД, але якщо немає — хоч
 *  щось показуємо. */
function loginToDisplay(login: string): string {
  return login.replace(/@.*$/, '');
}

export function TeamMeetingsView() {
  const sessionUser = useAppStore(s => s.user);
  const managedUsers = useMemo(() => sessionUser?.managedUsers ?? [], [sessionUser]);
  const namesByLogin = useManagedUserNames();

  // Мульти-регіон РМ (Пашковська: Одеса+Миколаїв) — 1С у managedUsers дає лише
  // домашній регіон. Тягнемо менеджерів усіх її регіонів через getRegionData
  // (director-proxy + фільтр по її regionCodes) + перемикач регіонів. Одно-
  // регіон РМ — без змін (managedUsers).
  const overrideRegions = sessionUser ? MULTI_REGION_RM_OVERRIDES[sessionUser.login] : undefined;
  const isMultiRegion = !!overrideRegions;
  const teamRegions = useMultiRegionTeams(isMultiRegion, overrideRegions);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [customRange, setCustomRange] = useState(() => calcDateRange(DEFAULT_PRESET));
  const [search, setSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState<'all' | string>('all');
  const [selectedRegion, setSelectedRegion] = useState<'all' | string>('all');

  const activeRange = useMemo(
    () => (datePreset === 'custom' ? customRange : calcDateRange(datePreset)),
    [datePreset, customRange],
  );

  // Логіни для фетчу: мульти-регіон → ВСІ менеджери всіх її регіонів (перемикач
  // фільтрує на клієнті, без ре-фетчу). Одно-регіон → null (сервер бере managedUsers).
  const allTeamLogins = useMemo<string[] | null>(() => {
    if (!isMultiRegion) return null;
    const s = new Set<string>();
    for (const r of teamRegions) for (const m of r.managers) if (m.login) s.add(m.login);
    return [...s];
  }, [isMultiRegion, teamRegions]);

  const { meetings, loading, error } = useMeetings(activeRange, 'managed', allTeamLogins);

  // Пілюлі-менеджери для поточного вибору регіону (одно-регіон → managedUsers).
  const pillManagers = useMemo<{ login: string; name: string }[]>(() => {
    if (!isMultiRegion) {
      return managedUsers.map(l => ({
        login: l.toLowerCase().trim(),
        name: namesByLogin.get(l.toLowerCase().trim()) ?? loginToDisplay(l),
      }));
    }
    const regs = selectedRegion === 'all' ? teamRegions : teamRegions.filter(r => r.code === selectedRegion);
    const seen = new Set<string>();
    const out: { login: string; name: string }[] = [];
    for (const r of regs) for (const m of r.managers) {
      if (m.login && !seen.has(m.login)) { seen.add(m.login); out.push(m); }
    }
    return out;
  }, [isMultiRegion, managedUsers, namesByLogin, selectedRegion, teamRegions]);

  // Set логінів обраного регіону (клієнт-фільтр зустрічей). null = усі регіони.
  const selectedRegionLogins = useMemo<Set<string> | null>(() => {
    if (!isMultiRegion || selectedRegion === 'all') return null;
    const s = new Set<string>();
    for (const r of teamRegions.filter(r => r.code === selectedRegion)) for (const m of r.managers) s.add(m.login);
    return s;
  }, [isMultiRegion, selectedRegion, teamRegions]);

  // Map клієнтів — потрібен для display name у досьє. Для команди тягнемо
  // тільки СВОЇХ клієнтів РМ — досьє відкривається у read-only-режимі.
  const { clients: myClients } = useMyClients();
  const clientsByID = useMemo(() => {
    const m = new Map<string, typeof myClients[number]>();
    for (const c of myClients) m.set(c.ClientID, c);
    return m;
  }, [myClients]);

  const [dossierClient, setDossierClient] = useState<{ id: string; name: string; phone: string } | null>(null);

  const filtered = useMemo(() => {
    let result = meetings;
    if (selectedRegionLogins) result = result.filter(m => selectedRegionLogins.has(m.managerLogin.toLowerCase().trim()));
    if (managerFilter !== 'all') result = result.filter(m => m.managerLogin === managerFilter);
    if (statusFilter !== 'all') result = result.filter(m => m.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      result = result.filter(m => {
        const c = clientsByID.get(m.clientId1c);
        const name = (c ? getClientName(c) : m.clientNameFromOneC ?? '').toLowerCase();
        const purpose = (m.purpose ?? '').toLowerCase();
        const comment = (m.comment ?? '').toLowerCase();
        return name.includes(q) || purpose.includes(q) || comment.includes(q);
      });
    }
    return [...result].sort((a, b) => {
      const ak = `${a.date}T${a.time}`;
      const bk = `${b.date}T${b.time}`;
      return ak.localeCompare(bk);
    });
  }, [meetings, managerFilter, statusFilter, search, clientsByID, selectedRegionLogins]);

  const groups = useMemo(() => groupMeetingsByDate(filtered, 'asc'), [filtered]);

  const handleClientClick = (clientId: string, fallbackName: string, fallbackPhone: string) => {
    setDossierClient({ id: clientId, name: fallbackName, phone: fallbackPhone });
  };

  // Лічильники по менеджеру (для значка біля pill). Ключ — lower-case login.
  const countsByManager = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of meetings) {
      const l = x.managerLogin.toLowerCase().trim();
      m.set(l, (m.get(l) ?? 0) + 1);
    }
    return m;
  }, [meetings]);

  if (!isMultiRegion && managedUsers.length === 0) {
    return (
      <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-8 text-center space-y-2 shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
        <UsersRound className="w-10 h-10 mx-auto text-muted-foreground/40" />
        <p className="text-[13px] text-muted-foreground">
          У вас немає підлеглих менеджерів.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shadow-sm">
          <UsersRound className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-bold tracking-tight text-emet-ink">Зустрічі команди</h2>
          <p className="text-[12px] text-muted-foreground">
            Read-only: перегляд зустрічей підлеглих {pillManagers.length === 1
              ? '1 менеджера'
              : `${pillManagers.length} менеджерів`}
          </p>
        </div>
      </div>

      {/* Date + status filters (reuse) + search */}
      <MeetingsFilters
        value={statusFilter}
        onChange={setStatusFilter}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Перемикач регіонів — тільки для мульти-регіон РМ (Пашковська) */}
      {isMultiRegion && teamRegions.length > 1 && (
        <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-3 md:p-4 shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-slate-500 mb-2">
            Регіон
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ManagerPill
              active={selectedRegion === 'all'}
              label="Усі регіони"
              count={meetings.length}
              onClick={() => { setSelectedRegion('all'); setManagerFilter('all'); }}
            />
            {teamRegions.map(r => {
              const regionLogins = new Set(r.managers.map(m => m.login));
              const cnt = meetings.filter(m => regionLogins.has(m.managerLogin.toLowerCase().trim())).length;
              return (
                <ManagerPill
                  key={r.code}
                  active={selectedRegion === r.code}
                  label={r.name}
                  count={cnt}
                  onClick={() => { setSelectedRegion(r.code); setManagerFilter('all'); }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Manager filter — pill row, тільки у TeamMeetingsView */}
      <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-3 md:p-4 shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
        <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-slate-500 mb-2">
          Менеджер
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ManagerPill
            active={managerFilter === 'all'}
            label="Усі"
            count={pillManagers.reduce((s, m) => s + (countsByManager.get(m.login) ?? 0), 0)}
            onClick={() => setManagerFilter('all')}
          />
          {pillManagers.map(m => (
            <ManagerPill
              key={m.login}
              active={managerFilter === m.login}
              label={m.name}
              count={countsByManager.get(m.login) ?? 0}
              onClick={() => setManagerFilter(m.login)}
            />
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Завантажую…
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-[13px] text-rose-700">
          <div className="font-semibold mb-1">Не вдалось завантажити зустрічі команди</div>
          <div className="text-[12px]">{error}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-8 text-center text-[13px] text-muted-foreground shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
          {meetings.length === 0
            ? 'У підлеглих немає зустрічей за обраний період.'
            : 'Нічого не знайдено за обраним фільтром.'}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.date} className="space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-500">
                {formatGroupDate(new Date(g.date))} · {g.items.length}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {g.items.map(m => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    client={clientsByID.get(m.clientId1c)}
                    onClientClick={handleClientClick}
                    readOnly
                    managerLabel={
                      namesByLogin.get(m.managerLogin.toLowerCase().trim())
                        ?? loginToDisplay(m.managerLogin)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dossier (read-only — досьє підтримує тільки інформацію) */}
      <ClientDossierDialog
        open={!!dossierClient}
        onClose={() => setDossierClient(null)}
        clientId={dossierClient?.id ?? null}
        clientNameFallback={dossierClient?.name ?? ''}
        phoneFallback={dossierClient?.phone ?? ''}
      />
    </div>
  );
}

function ManagerPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold transition-all border ${
        active
          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
          : 'bg-white text-slate-700 border-slate-200 hover:border-violet-400 hover:text-violet-700'
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full tabular-nums ${
          active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Hook: повертає Map<login → fullName> для всіх менеджерів регіону через
 * 1С `getRegionData` (Action 5). Викликається з login РМ за поточний місяць —
 * у відповіді приходять regions[].managers[] з полями managerLogin/managerName.
 *
 * Кешується SWR-ом між рендерами. Якщо запит ще не виконаний — fallback
 * на короткий логін без домена.
 */
function useManagedUserNames(): Map<string, string> {
  const user = useAppStore(s => s.user);
  const period = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const { data } = useOneCData(
    'getRegionData',
    user ? { login: user.login, period } : null,
  );
  return useMemo(() => {
    const map = new Map<string, string>();
    const regions = (data as {
      regions?: Array<{
        managers?: Array<{ managerLogin?: string; managerName?: string }>;
      }>;
    })?.regions ?? [];
    for (const r of regions) {
      for (const m of r.managers ?? []) {
        if (m.managerLogin && m.managerName) {
          map.set(m.managerLogin.toLowerCase().trim(), m.managerName);
        }
      }
    }
    return map;
  }, [data]);
}

/**
 * Hook: для мульти-регіон РМ (Пашковська — MULTI_REGION_RM_OVERRIDES) повертає
 * менеджерів УСІХ її регіонів через `getRegionData` director-proxy + фільтр по
 * її regionCodes. adaptRegionData коректно розрулює regionCode/regionName.
 * Одно-регіон РМ (isMulti=false) → [] (зайвий 1С-виклик не робимо).
 */
function useMultiRegionTeams(
  isMulti: boolean,
  overrideRegions: readonly string[] | undefined,
): { code: string; name: string; managers: { login: string; name: string }[] }[] {
  const period = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const { data } = useOneCData(
    'getRegionData',
    isMulti ? { login: DIRECTOR_PROXY_LOGIN, period } : null,
  );
  return useMemo(() => {
    if (!isMulti || !data) return [];
    const codes = overrideRegions ?? [];
    return adaptRegionData(data).regions
      .filter(r => codes.includes(r.regionCode))
      .map(r => ({
        code: r.regionCode,
        name: r.regionName,
        managers: r.managers
          .map(m => ({ login: m.login.toLowerCase().trim(), name: m.name || m.login }))
          .filter(m => m.login),
      }));
  }, [isMulti, data, overrideRegions]);
}
