import { useMemo, useState, type ReactNode } from 'react';
import { Calendar, Phone, GraduationCap, ChevronDown } from 'lucide-react';
import { currentYearMonth, formatMonthLabel } from '../client-helpers';

/**
 * Події клієнта: hybrid block (узгоджено 2026-05-27):
 *  - Ліва (2fr): Зустрічі + Дзвінки з tab-фільтром + history toggle (V3-style monthly).
 *  - Права (1fr): Семінари — ВСІ показуємо (рідкісна подія).
 *
 * На вузьких екранах — стек у одну колонку.
 *
 * Виокремлено з clients-page.tsx (Day 5 рефактору).
 */

type EventType = 'meeting' | 'call' | 'seminar';
type TimelineEvent = { date: string; comment: string; type: EventType };
type CallMeetingFilter = 'all' | 'meeting' | 'call';

export function EventsTimeline({
  meetings,
  calls,
  seminars,
  totalCount,
}: {
  meetings: { date: string; comment: string }[];
  calls: { date: string; comment: string }[];
  seminars: { date: string; comment: string }[];
  totalCount: number;
}) {
  const [filter, setFilter] = useState<CallMeetingFilter>('all');
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Об'єднуємо зустрічі+дзвінки, sort desc.
  const meetingsAndCalls: TimelineEvent[] = useMemo(() => {
    const all: TimelineEvent[] = [];
    for (const e of meetings) all.push({ ...e, type: 'meeting' });
    for (const e of calls) all.push({ ...e, type: 'call' });
    return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [meetings, calls]);

  const filtered = useMemo(() => {
    if (filter === 'all') return meetingsAndCalls;
    return meetingsAndCalls.filter(e => e.type === filter);
  }, [meetingsAndCalls, filter]);

  // Поточний місяць vs історія.
  const ym = currentYearMonth();
  const currentMonth = useMemo(() => filtered.filter(e => (e.date || '').slice(0, 7) === ym), [filtered, ym]);
  const history = useMemo(() => filtered.filter(e => (e.date || '').slice(0, 7) !== ym), [filtered, ym]);

  // Групуємо історію по місяцях.
  const historyByMonth = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    for (const e of history) {
      const k = (e.date || '').slice(0, 7) || 'unknown';
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  // Семінари — sort desc.
  const sortedSeminars = useMemo(
    () => [...seminars].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [seminars],
  );

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

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        {/* === ЛІВА КОЛОНКА: Зустрічі + Дзвінки === */}
        <div className="glass-card-soft p-3">
          <div className="flex gap-1.5 mb-2 flex-wrap">
            <TabBtn active={filter === 'all'} onClick={() => setFilter('all')} count={meetingsAndCalls.length}>Усі</TabBtn>
            <TabBtn active={filter === 'meeting'} onClick={() => setFilter('meeting')} count={meetings.length} icon={<Calendar className="h-3 w-3" />} color="emet">Зустрічі</TabBtn>
            <TabBtn active={filter === 'call'} onClick={() => setFilter('call')} count={calls.length} icon={<Phone className="h-3 w-3" />} color="emerald">Дзвінки</TabBtn>
          </div>

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

        {/* === ПРАВА КОЛОНКА: Семінари === */}
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
function TabBtn({
  active,
  onClick,
  count,
  icon,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  icon?: ReactNode;
  color?: 'emet' | 'emerald';
  children: ReactNode;
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

/** Компактний рядок події (зустріч/дзвінок). */
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

/** Семінар-рядок — на правій колонці. */
function SeminarRow({
  event,
  currentYM,
}: {
  event: { date: string; comment: string };
  currentYM: string;
}) {
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
