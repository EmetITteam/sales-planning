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
import {
  calcDateRange,
  DEFAULT_PRESET,
  type DatePreset,
} from '@/lib/meetings/date-presets';
import { groupMeetingsByDate, type MeetingWithSync } from '@/lib/meetings/mock-data';
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
  const managedUsers = sessionUser?.managedUsers ?? [];
  const namesByLogin = useManagedUserNames();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [customRange, setCustomRange] = useState(() => calcDateRange(DEFAULT_PRESET));
  const [search, setSearch] = useState('');
  const [managerFilter, setManagerFilter] = useState<'all' | string>('all');

  const activeRange = useMemo(
    () => (datePreset === 'custom' ? customRange : calcDateRange(datePreset)),
    [datePreset, customRange],
  );

  const { meetings, loading, error } = useMeetings(activeRange, 'managed');

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
  }, [meetings, managerFilter, statusFilter, search, clientsByID]);

  const groups = useMemo(() => groupMeetingsByDate(filtered, 'asc'), [filtered]);

  const handleClientClick = (clientId: string, fallbackName: string, fallbackPhone: string) => {
    setDossierClient({ id: clientId, name: fallbackName, phone: fallbackPhone });
  };

  // Лічильники по менеджеру (для значка біля pill).
  const countsByManager = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of meetings) {
      m.set(x.managerLogin, (m.get(x.managerLogin) ?? 0) + 1);
    }
    return m;
  }, [meetings]);

  if (managedUsers.length === 0) {
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
            Read-only: перегляд зустрічей підлеглих {managedUsers.length === 1
              ? '1 менеджера'
              : `${managedUsers.length} менеджерів`}
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

      {/* Manager filter — pill row, тільки у TeamMeetingsView */}
      <div className="bg-white/60 backdrop-blur-xl backdrop-saturate-150 border border-white/55 rounded-2xl p-3 md:p-4 shadow-[0_4px_14px_rgba(6,42,61,0.04)]">
        <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-slate-500 mb-2">
          Менеджер
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ManagerPill
            active={managerFilter === 'all'}
            label="Усі"
            count={meetings.length}
            onClick={() => setManagerFilter('all')}
          />
          {managedUsers.map(login => (
            <ManagerPill
              key={login}
              active={managerFilter === login}
              label={namesByLogin.get(login.toLowerCase().trim()) ?? loginToDisplay(login)}
              count={countsByManager.get(login) ?? 0}
              onClick={() => setManagerFilter(login)}
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
