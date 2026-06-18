/**
 * ClientPickerDialog — пошук і вибір клієнта при створенні/редагуванні зустрічі.
 *
 * Поведінка:
 *  - Список менеджерських клієнтів вантажиться через `useMyClients()` (SWR-кеш).
 *  - Live-filter по `ClientName` + `Phone` коли введено ≥ 2 символи.
 *  - Кнопка «Шукати у всій базі» з'являється коли локально знайдено < 5 рядків —
 *    тригерить 1С `findClient` (debounced) щоб витягти чужих клієнтів.
 *
 * Mobile: bottom-sheet, Desktop: modal — той самий patternchasing що
 * LocationCaptureDialog/MeetingForm.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, SearchIcon, Loader2Icon, PhoneIcon } from 'lucide-react';
import { useMyClients } from '@/lib/use-my-clients';
import { useOneCData } from '@/lib/use-onec-data';
import { getClientName, getClientAddress, type ClientFromOneC } from '@/lib/mityng-types';

export interface PickedClient {
  clientId1c: string;
  clientName: string;
  phone: string;
  address: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (client: PickedClient) => void;
  /** Якщо вже обрано — підсвічуємо у списку. */
  selectedClientId?: string;
}

const DEBOUNCE_MS = 350;
const REMOTE_TRIGGER_THRESHOLD = 5;

export function ClientPickerDialog({ open, onClose, onSelect, selectedClientId }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [remoteSearch, setRemoteSearch] = useState(false);

  // Reset on each open — render-phase setState (React 19 canonical).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setRemoteSearch(false);
    }
  }

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { clients: myClients, loading: myLoading } = useMyClients();

  // Local filter
  const localResults = useMemo(() => {
    if (!debouncedQuery) return myClients.slice(0, 40);
    const q = debouncedQuery.toLowerCase();
    return myClients.filter(c => {
      const name = getClientName(c).toLowerCase();
      const phone = (c.Phone ?? '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [debouncedQuery, myClients]);

  // Remote search (1С findClient) — тільки коли користувач натиснув кнопку АБО
  // запит ≥ 3 символи І локальних мало. Не запускаємо автоматично щоб не
  // тригерити 1С на кожне натискання клавіші.
  const shouldRemote = remoteSearch && debouncedQuery.length >= 2;
  const { data: remoteData, loading: remoteLoading } = useOneCData(
    'findClient',
    // `managerLogin` override з сесії робиться у /api/onec — лишаємо empty,
    // proxy підставляє session.login. searchTerm — наш query.
    shouldRemote ? { searchTerm: debouncedQuery, managerLogin: '' } : null,
  );
  const remoteResults: ClientFromOneC[] = useMemo(() => {
    if (!remoteData?.clients) return [];
    // Dedup проти local
    const localIds = new Set(localResults.map(c => c.ClientID));
    return remoteData.clients.filter((c: ClientFromOneC) => !localIds.has(c.ClientID));
  }, [remoteData, localResults]);

  const canTriggerRemote =
    !remoteSearch && debouncedQuery.length >= 2 && localResults.length < REMOTE_TRIGGER_THRESHOLD;

  const handlePick = (c: ClientFromOneC) => {
    onSelect({
      clientId1c: c.ClientID,
      clientName: getClientName(c),
      phone: c.Phone ?? '',
      address: getClientAddress(c),
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-[60] bg-white overflow-hidden flex flex-col
            max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:h-[88vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[560px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:h-[640px] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
            data-ending-style:opacity-0 max-md:data-ending-style:translate-y-full md:data-ending-style:scale-95
            data-starting-style:opacity-0 max-md:data-starting-style:translate-y-full md:data-starting-style:scale-95
            transition-all duration-200
          "
        >
          <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
            <DialogPrimitive.Title className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight">
              Обрати клієнта
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          {/* Search */}
          <div className="px-5 py-3 md:px-6 shrink-0 border-b border-slate-100">
            <div className="relative">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setRemoteSearch(false);
                }}
                placeholder="Назва або телефон…"
                className="w-full font-sans text-[14px] text-emet-ink bg-white border border-slate-200 rounded-[12px] pl-10 pr-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all placeholder:text-slate-400"
              />
            </div>
            {canTriggerRemote && (
              <button
                type="button"
                onClick={() => setRemoteSearch(true)}
                className="mt-2 text-[12px] font-semibold text-emet-blue hover:underline"
              >
                Шукати «{debouncedQuery}» у всій базі 1С →
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {myLoading && localResults.length === 0 && (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2Icon className="w-5 h-5 animate-spin" />
              </div>
            )}

            {!myLoading && localResults.length === 0 && !remoteSearch && (
              <div className="px-5 py-10 text-center text-[13px] text-slate-500">
                {debouncedQuery
                  ? 'Серед ваших клієнтів нічого не знайдено. Спробуйте «Шукати у всій базі».'
                  : 'Ще нема жодного клієнта.'}
              </div>
            )}

            {localResults.length > 0 && (
              <div className="divide-y divide-slate-100">
                {!debouncedQuery && (
                  <div className="px-5 md:px-6 py-2 text-[10px] font-bold uppercase tracking-[0.7px] text-slate-400 bg-slate-50/60">
                    Ваші клієнти
                  </div>
                )}
                {localResults.map(c => (
                  <ClientRow
                    key={c.ClientID}
                    client={c}
                    isMine
                    isSelected={c.ClientID === selectedClientId}
                    onClick={() => handlePick(c)}
                  />
                ))}
              </div>
            )}

            {remoteSearch && (
              <>
                {remoteLoading && (
                  <div className="flex items-center justify-center py-6 text-slate-400">
                    <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-[12px]">шукаю у 1С…</span>
                  </div>
                )}
                {!remoteLoading && remoteResults.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    <div className="px-5 md:px-6 py-2 text-[10px] font-bold uppercase tracking-[0.7px] text-slate-400 bg-slate-50/60">
                      Інші клієнти бази · закріплені за колегами
                    </div>
                    {remoteResults.map(c => (
                      <ClientRow
                        key={c.ClientID}
                        client={c}
                        isMine={false}
                        isSelected={c.ClientID === selectedClientId}
                        /* Чужого клієнта не дозволяємо вибрати — не можна
                           створювати зустріч на клієнті колеги. Клік ігнор. */
                        onClick={() => {}}
                      />
                    ))}
                  </div>
                )}
                {!remoteLoading && remoteResults.length === 0 && (
                  <div className="px-5 py-6 text-center text-[12px] text-slate-500">
                    У 1С теж нічого не знайдено.
                  </div>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ClientRow({
  client,
  isMine,
  isSelected,
  onClick,
}: {
  client: ClientFromOneC;
  /** true для local list (свої клієнти менеджера). false для remote findClient. */
  isMine: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const name = getClientName(client);
  const address = getClientAddress(client);
  const managerName = client.managerName?.trim() || '';

  // Чужий клієнт — статичний рядок без cursor/hover. Менеджер не може
  // створити зустріч на клієнті колеги (це обхід відповідального). Логіка
  // ідентична з GlobalClientSearchDialog у /clients.
  if (!isMine) {
    return (
      <div
        className="w-full text-left px-5 md:px-6 py-3 flex flex-col gap-0.5 cursor-not-allowed opacity-90"
        title="Це клієнт іншого менеджера — створити зустріч не можна."
      >
        <div className="text-[14px] font-bold text-emet-ink leading-tight">{name}</div>
        <div className="text-[11px] text-slate-500">
          Менеджер: <span className="font-semibold text-slate-700">{managerName || 'Не призначено'}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-5 md:px-6 py-3 hover:bg-emet-blue/[0.04] transition-colors flex flex-col gap-0.5 ${
        isSelected ? 'bg-emet-blue/[0.06]' : ''
      }`}
    >
      <div className="text-[14px] font-bold text-emet-ink leading-tight">{name}</div>
      <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
        {client.Phone && (
          <span className="inline-flex items-center gap-1">
            <PhoneIcon className="w-3 h-3 text-emerald-600" />
            <span className="tabular-nums font-mono">{client.Phone}</span>
          </span>
        )}
        {address && <span className="truncate">{address}</span>}
      </div>
    </button>
  );
}
