/**
 * GlobalClientSearchDialog — пошук клієнта по ВСІЙ базі компанії.
 *
 * Split-implementation:
 *  - Mobile (≤768px): vaul Drawer — bottom-sheet з нативним обробником iOS-
 *    клавіатури (repositionInputs=true). Це вирішило проблему скролу при
 *    відкритій клавіатурі у PWA — base-ui Dialog не справлявся.
 *  - Desktop (>768px): base-ui DialogPrimitive — центрована модалка з fade.
 *    Vaul на desktop slide-up-ється з низу екрану, що виглядає неправильно
 *    для desktop-UX і підлагує.
 *
 * Use case:
 *  - Дзвонить клієнт → менеджер не знаходить у своєму списку → відкриває
 *    глобальний пошук → знаходить → бачить ім'я менеджера за яким клієнт
 *    закріплений → передає дзвінок.
 *  - Перевірити чи клієнт взагалі є у базі перед створенням нового.
 *
 * Запит: 1С `findClient` action з `searchTerm` + `managerLogin` (override
 * з сесії на бекенді). Шукає по name + phone у всій базі компанії.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, SearchIcon, Loader2Icon, PhoneIcon, UsersIcon } from 'lucide-react';
import { useOneCData } from '@/lib/use-onec-data';
import { useAppStore } from '@/lib/store';
import { getClientName, getClientAddress, type ClientFromOneC } from '@/lib/mityng-types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectMine?: (clientId: string) => void;
}

const DEBOUNCE_MS = 350;
const MOBILE_BREAKPOINT_PX = 768;

/** Helper: визначає чи поточний viewport mobile. Listen на resize щоб
 *  переключатись між vaul/base-ui без перевідкриття. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    setIsMobile(mq.matches);
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return isMobile;
}

export function GlobalClientSearchDialog({ open, onClose, onSelectMine }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const sessionUser = useAppStore(s => s.user);
  const myLogin = (sessionUser?.login ?? '').toLowerCase().trim();
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  // Делейний фокус — щоб vaul slide-up анімація встигла завершитись перш
  // ніж клавіатура спливе (інакше perша анімація + клавіатура одночасно
  // → drawer не позиціонується → «білий екран»). На desktop теж не повредить.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), isMobile ? 400 : 100);
    return () => clearTimeout(t);
  }, [open, isMobile]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const shouldFetch = debouncedQuery.length >= 2;
  const { data, loading } = useOneCData(
    'findClient',
    shouldFetch && sessionUser
      ? { searchTerm: debouncedQuery, managerLogin: '' }
      : null,
  );
  const results: ClientFromOneC[] = useMemo(() => data?.clients ?? [], [data]);

  // Shared body — header + search input + results list
  const body = (
    <>
      <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
        <div className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight inline-flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-emet-blue" />
          Пошук по всій базі
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
          aria-label="Закрити"
        >
          <XIcon className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Search */}
      <div className="px-5 py-3 md:px-6 shrink-0 border-b border-slate-100">
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Назва, телефон…"
            className="w-full text-[14px] text-emet-ink bg-white border border-slate-200 rounded-[12px] pl-10 pr-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all"
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Шукаємо у всій клієнтській базі компанії. Поряд показано якому менеджеру
          клієнт закріплений.
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        {debouncedQuery.length < 2 && (
          <div className="px-5 py-10 text-center text-[13px] text-slate-500">
            Введіть мінімум 2 символи для пошуку.
          </div>
        )}

        {loading && shouldFetch && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2Icon className="w-5 h-5 animate-spin mr-2" />
            <span className="text-[12px]">шукаю у 1С…</span>
          </div>
        )}

        {!loading && shouldFetch && results.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-slate-500">
            Клієнтів не знайдено. Можна спробувати створити нового.
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="divide-y divide-slate-100">
            {results.map(c => (
              <ClientRow
                key={c.ClientID}
                client={c}
                myLogin={myLogin}
                onSelectMine={onSelectMine}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  // Mobile: vaul Drawer (bottom-sheet з iOS keyboard handling)
  if (isMobile) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={v => !v && onClose()}
        repositionInputs={true}
        dismissible={true}
        modal={true}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-[60] bg-emet-ink/40 backdrop-blur-[2px]" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-white flex flex-col outline-none h-[96dvh] rounded-t-3xl shadow-[0_-8px_40px_rgba(6,42,61,0.20)]"
          >
            <Drawer.Title className="sr-only">Пошук по всій базі</Drawer.Title>
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            {body}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Desktop: base-ui DialogPrimitive (центрована модалка з fade)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-[60] bg-white overflow-hidden flex flex-col
            top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[560px] max-w-[calc(100vw-32px)] h-[640px] max-h-[calc(100vh-64px)]
            rounded-3xl shadow-[0_24px_60px_rgba(6,42,61,0.25)]
            data-ending-style:opacity-0 data-ending-style:scale-95
            data-starting-style:opacity-0 data-starting-style:scale-95
            transition-all duration-200
          "
        >
          <DialogPrimitive.Title className="sr-only">Пошук по всій базі</DialogPrimitive.Title>
          {body}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ClientRow({
  client,
  myLogin,
  onSelectMine,
}: {
  client: ClientFromOneC;
  myLogin: string;
  onSelectMine?: (clientId: string) => void;
}) {
  const name = getClientName(client);
  const address = getClientAddress(client);
  const phoneClean = (client.Phone || '').replace(/[^+\d]/g, '');
  const managerName = client.managerName?.trim() || '';
  const isMine =
    client.isMine === true ||
    (!!managerName && managerName.toLowerCase() === myLogin);

  const handleClick = () => {
    if (isMine && onSelectMine) onSelectMine(client.ClientID);
  };

  const containerClass = isMine
    ? 'w-full text-left px-5 md:px-6 py-3 flex flex-col gap-1 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer'
    : 'px-5 md:px-6 py-3 flex flex-col gap-1';

  const inner = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[14px] font-bold text-emet-ink truncate">{name}</span>
        {isMine && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emet-blue/10 text-emet-blue border border-emet-blue/20">
            Ваш
          </span>
        )}
      </div>

      {isMine ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          {client.Phone && (
            <a
              href={`tel:${phoneClean}`}
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold"
            >
              <PhoneIcon className="w-3 h-3" />
              <span className="font-mono tabular-nums">{client.Phone}</span>
            </a>
          )}
          {address && <span className="text-slate-500 truncate">{address}</span>}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 mt-0.5">
          Менеджер: <span className="font-semibold text-slate-700">{managerName || 'Не призначено'}</span>
        </div>
      )}
    </>
  );

  if (isMine) {
    return (
      <button type="button" onClick={handleClick} className={containerClass}>
        {inner}
      </button>
    );
  }
  return <div className={containerClass}>{inner}</div>;
}
