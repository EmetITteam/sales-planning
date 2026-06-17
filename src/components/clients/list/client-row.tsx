import type React from 'react';
import { Phone, CheckCircle2, ChevronDown, Loader2, Calendar, Cake, MessageSquare, AlertCircle } from 'lucide-react';
import type { ClientFocusItem, ClientActivity } from '@/lib/use-my-clients';
import type { ClientVerification } from '@/lib/client-verifications/types';
import {
  getClientName,
  getClientAddress,
  isClientReserved,
  getClientBirthDate,
  getAge,
  isBirthdayToday,
  getLastMeetingDate,
  getLastCallDate,
  type ClientFromOneC,
} from '@/lib/mityng-types';
import {
  toUICategory,
  toUkrainianChip,
  initials,
  pluralUaYears,
  CAT_COLOR,
} from '../client-helpers';
import { NumCol } from '../shared/num-col';
import { PctCol } from '../shared/pct-col';

/**
 * <ClientRow> — один рядок клієнта (card-like) з:
 *  - Avatar + ПІБ + chip-категорія + бейджі (reserved/verification/focus/birthday)
 *  - Mobile footer: Дзвонити / Зустріч / Рекламація (44px touch targets)
 *  - Desktop inline: phone link + остання подія + коментарі + claim button
 *  - НумКол план/факт + PctCol виконання
 *  - Toggle експанду (ClientExpand)
 *
 * Виокремлено з clients-page.tsx (Day 4 рефактору).
 */
export function ClientRow({
  client,
  plan,
  fact,
  focuses,
  activity,
  commentsCount,
  verification,
  meetingMissing,
  totalsLoading,
  expanded,
  onToggle,
  onCreateMeeting,
  onCreateClaim,
  children,
}: {
  client: ClientFromOneC;
  plan: number | null;
  fact: number | null;
  focuses: ClientFocusItem[];
  /** Остання подія по клієнту (дзвінок/зустріч) з checkActivities. */
  activity?: ClientActivity | null;
  /** Кількість коментарів менеджера по клієнту (для badge у згорнутій картці). */
  commentsCount?: number;
  /** Активна верифікація КЦ через Bitrix SPA 1048. Null якщо немає. */
  verification?: ClientVerification | null;
  /** У плані поточного місяця stage='Зустріч', але реальної події у 1С ще нема. */
  meetingMissing?: boolean;
  totalsLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCreateMeeting?: (client: ClientFromOneC) => void;
  /** Sprint 2B.C: відкрити форму нової рекламації з prefilled клієнтом. */
  onCreateClaim?: (client: ClientFromOneC) => void;
  /** Контент експанду (ClientExpand) — рендериться тільки якщо expanded=true. */
  children?: React.ReactNode;
}) {
  const cat = toUICategory(client.ClientCategory);
  const phoneClean = (client.Phone || '').replace(/[^+\d]/g, '');
  const name = getClientName(client);
  const address = getClientAddress(client);
  const birthISO = getClientBirthDate(client);
  const age = getAge(birthISO);
  const isBirthday = isBirthdayToday(birthISO);
  const birthDisplay = birthISO
    ? (() => {
        const [, mo, d] = birthISO.split('-');
        const base = `${d}.${mo}`;
        return age != null ? `${base} · ${age} ${pluralUaYears(age)}` : base;
      })()
    : '';
  // Остання подія: bulk-поля з getManagerClients (історія загалом) + fallback
  // на activityByClient (checkActivities, поточний місяць). Беремо пізнішу.
  // ⚠️ 1С повертає дату у двох форматах:
  //   - bulk getManagerClients: 'DD.MM.YYYY'
  //   - checkActivities:        'YYYY-MM-DD'
  const lastEvent = (() => {
    function parse(raw: string): { y: string; mo: string; d: string; iso: string } | null {
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const [y, mo, d] = raw.split('-');
        return { y, mo, d, iso: `${y}-${mo}-${d}` };
      }
      if (/^\d{2}\.\d{2}\.\d{4}/.test(raw)) {
        const [d, mo, y] = raw.split('.');
        return { y, mo, d, iso: `${y}-${mo}-${d}` };
      }
      return null;
    }
    const call = parse(getLastCallDate(client) || activity?.lastCallDate || '');
    const meet = parse(getLastMeetingDate(client) || activity?.lastMeetingDate || '');
    if (!call && !meet) return null;
    const pickMeeting = !call || (meet && meet.iso >= call.iso);
    const chosen = pickMeeting ? meet : call;
    if (!chosen) return null;
    const thisYear = new Date().getFullYear();
    const dateLabel = Number(chosen.y) === thisYear
      ? `${chosen.d}.${chosen.mo}`
      : `${chosen.d}.${chosen.mo}.${chosen.y.slice(-2)}`;
    return { type: pickMeeting ? 'meeting' as const : 'call' as const, dateLabel };
  })();
  // Стани плану/факту:
  //   plan>0  → реальна сума
  //   plan=0, fact=0 → «Без плану»
  //   plan=0, fact>0 → «Незаплановані»
  const hasPlan = plan != null && Number.isFinite(plan) && plan > 0;
  const hasFact = fact != null && Number.isFinite(fact) && fact > 0;
  const rawPct = (hasPlan && fact != null && Number.isFinite(fact)) ? (fact / (plan as number)) * 100 : null;
  const pct: number | null = (rawPct !== null && Number.isFinite(rawPct)) ? rawPct : null;
  const completed = hasPlan && fact != null && fact >= (plan as number);
  const noPlanNoFact = !totalsLoading && !hasPlan && !hasFact;
  const unplannedFact = !totalsLoading && !hasPlan && hasFact;
  const dimmedRow = noPlanNoFact;

  return (
    <div data-client-row={client.ClientID} className={`glass-card-flat overflow-hidden ${dimmedRow ? 'opacity-70' : ''}`}>
      {/* HTML забороняє button-в-button — outer = div role="button" з
          keyboard support, а inner phone/calendar — справжні <a>/<button>. */}
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
        className="w-full grid grid-cols-[36px_minmax(0,1fr)] md:grid-cols-[40px_minmax(0,1.6fr)_85px_85px_70px_24px] gap-3.5 md:gap-4 items-center px-3 md:px-4 py-3 hover:bg-white/40 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40"
      >
        <div className={`flex w-9 md:w-10 h-9 md:h-10 rounded-xl bg-emet-50 ${CAT_COLOR[cat].text} items-center justify-center text-[11px] md:text-[12px] font-bold shrink-0`}>
          {initials(name)}
        </div>

        <div className="min-w-0">
          <div className="md:flex md:items-center md:gap-2 md:flex-wrap min-w-0">
          <p className="text-[14px] font-bold truncate leading-tight min-w-0">{name || '— без назви —'}</p>
          <div className="flex items-center gap-1.5 mt-1 md:mt-0 min-w-0 flex-wrap">
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-white/40 ${CAT_COLOR[cat].text}`}>
              {toUkrainianChip(client.ClientCategory)}
            </span>
            {isClientReserved(client) && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-slate-400/12 text-slate-600 border border-slate-300/50 backdrop-blur-sm" title="Клієнт у Резерві — виключений з планування">
                Резерв
              </span>
            )}
            {verification && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-amber-500/12 text-amber-700 border border-amber-300/50 backdrop-blur-sm"
                title={
                  verification.status === 'clarification'
                    ? 'КЦ запитує уточнення — подивись у повідомленнях'
                    : verification.status === 'in_progress'
                    ? 'КЦ обробляє вашу заявку — як буде готово, прийде сповіщення'
                    : 'Клієнт на верифікації у КЦ — чекаємо підтвердження'
                }
              >
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {verification.status === 'clarification' ? 'Уточнення КЦ' : 'На верифікації КЦ'}
              </span>
            )}
            {meetingMissing && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-amber-500/12 text-amber-700 border border-amber-300/50 backdrop-blur-sm"
                title="У плані стоїть етап «Зустріч», але точну дату й час ще не заплановано."
              >
                <Calendar className="w-2.5 h-2.5" />
                Зустріч без дати
              </span>
            )}
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
            {isBirthday && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap bg-emet-blue/10 text-emet-blue border border-emet-blue/30 backdrop-blur-sm"
                title={`Сьогодні день народження${age != null ? ` · ${age} ${pluralUaYears(age)}` : ''}`}
              >
                <Cake className="w-2.5 h-2.5" />
                Сьогодні ДН
              </span>
            )}
          </div>
          </div>
          <div className={`${address ? 'flex' : 'hidden md:flex'} items-center gap-2 text-[11px] text-muted-foreground mt-1 min-w-0`}>
            {address && <span className="truncate">{address}</span>}
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
            {lastEvent && (
              <>
                <span className="text-muted-foreground/40 shrink-0 hidden md:inline">·</span>
                <span className="hidden md:inline-flex items-center gap-1 shrink-0">
                  {lastEvent.type === 'meeting'
                    ? <Calendar className="h-3 w-3" />
                    : <Phone className="h-3 w-3" />}
                  <span>
                    Остання подія: {lastEvent.type === 'meeting' ? 'зустріч' : 'дзвінок'}
                    {' · '}<span className="tabular-nums font-medium text-slate-700">{lastEvent.dateLabel}</span>
                  </span>
                </span>
              </>
            )}
            {commentsCount != null && commentsCount > 0 && (
              <>
                <span className="text-muted-foreground/40 shrink-0 hidden md:inline">·</span>
                <span className="hidden md:inline-flex items-center gap-1 shrink-0">
                  <MessageSquare className="h-3 w-3" />
                  <span>коментарі: <span className="tabular-nums font-medium text-slate-700">{commentsCount}</span></span>
                </span>
              </>
            )}
          </div>

          {/* Sprint 2B.C: «Подати рекламацію» — окремим рядком ПІД телефоном/зустріччю. */}
          {onCreateClaim && (
            <div className="hidden md:flex items-center gap-1 mt-1.5">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onCreateClaim(client);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] text-rose-700 hover:text-rose-800 font-semibold transition-colors"
              >
                <AlertCircle className="h-3 w-3" />
                Подати рекламацію
              </button>
            </div>
          )}

          {/* Mobile-only: остання подія ПЕРЕД датою народження. */}
          {lastEvent && (
            <div className="md:hidden flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1 min-w-0">
              {lastEvent.type === 'meeting'
                ? <Calendar className="h-3 w-3 shrink-0" />
                : <Phone className="h-3 w-3 shrink-0" />}
              <span>
                Остання подія: {lastEvent.type === 'meeting' ? 'зустріч' : 'дзвінок'}
                {' · '}<span className="tabular-nums font-medium text-slate-700">{lastEvent.dateLabel}</span>
              </span>
            </div>
          )}

          {/* Mobile-only: коментарі менеджера (badge). */}
          {commentsCount != null && commentsCount > 0 && (
            <div className="md:hidden flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1 min-w-0">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span>коментарі: <span className="tabular-nums font-medium text-slate-700">{commentsCount}</span></span>
            </div>
          )}

          {/* Дата народження окремим рядком — тільки коли ДН НЕ сьогодні. */}
          {birthDisplay && !isBirthday && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1 min-w-0">
              <Cake className="h-3 w-3 shrink-0" />
              <span className="tabular-nums">{birthDisplay}</span>
            </div>
          )}
        </div>

        <NumCol label="План" value={plan} loading={totalsLoading} emptyAs={hasFact ? 'zero' : null} />
        <NumCol label="Факт" value={fact} loading={totalsLoading} emptyAs="zero" />
        <PctCol pct={pct} loading={totalsLoading} disabled={!hasPlan} />

        <ChevronDown className={`hidden md:block h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* MOBILE action footer — Дзвонити / Зустріч / Рекламація (44px taps). */}
      {(client.Phone || onCreateMeeting || onCreateClaim) && (
        <div className="md:hidden flex items-stretch gap-2 px-3 pb-3 pt-2 border-t border-emet-ink/[0.06]">
          {client.Phone && (
            <a
              href={`tel:${phoneClean}`}
              onClick={e => e.stopPropagation()}
              aria-label={`Подзвонити ${name}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-[10px] bg-white/70 backdrop-blur-md border border-emet-blue/25 text-emet-blue active:bg-emet-blue active:text-white text-[13px] font-semibold shadow-sm active:scale-[0.98] transition-all"
            >
              <Phone className="w-4 h-4" />
              Дзвонити
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
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-[10px] bg-white/70 backdrop-blur-md border border-emet-blue/25 text-emet-blue active:bg-emet-blue active:text-white text-[13px] font-semibold shadow-sm active:scale-[0.98] transition-all"
            >
              <Calendar className="w-4 h-4" />
              Зустріч
            </button>
          )}
          {onCreateClaim && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCreateClaim(client);
              }}
              aria-label={`Подати рекламацію по ${name}`}
              title="Подати рекламацію"
              className="inline-flex items-center justify-center w-11 h-11 rounded-[10px] bg-white/70 backdrop-blur-md border border-rose-300/40 text-rose-700 active:bg-rose-600 active:text-white shadow-sm active:scale-[0.98] transition-all shrink-0"
            >
              <AlertCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {expanded && children}
    </div>
  );
}
