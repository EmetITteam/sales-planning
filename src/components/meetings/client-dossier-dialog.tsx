/**
 * ClientDossierDialog — короткий клієнтський «досьє» що відкривається кліком
 * на ім'я клієнта у картці зустрічі.
 *
 * Не повна копія /clients-картки (та має ~1900 LOC) — навмисно мінімалістичний
 * погляд для контексту зустрічі: ім'я, статус, телефон, адреса, останні
 * взаємодії (last meeting / call), категорії продажів. Якщо треба глибше —
 * кнопка «Відкрити повне досьє» веде на /clients.
 *
 * Lazy load: `useClientReport` запускається лише коли dialog відкритий.
 */

'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  XIcon,
  PhoneIcon,
  MapPinIcon,
  Loader2Icon,
  CalendarIcon,
  ExternalLinkIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useClientReport } from '@/lib/use-my-clients';
import { useRouter } from 'next/navigation';

interface Props {
  open: boolean;
  clientId: string | null;
  clientNameFallback?: string;
  phoneFallback?: string;
  onClose: () => void;
}

export function ClientDossierDialog({ open, clientId, clientNameFallback, phoneFallback, onClose }: Props) {
  const { report, loading, error } = useClientReport(open ? clientId : null);
  const router = useRouter();

  const info = report?.clientInfo;
  const name = info?.name ?? clientNameFallback ?? '—';
  const phone = info?.phone ?? phoneFallback ?? '';
  const phoneClean = phone.replace(/[^+\d]/g, '');
  const address = info?.address ?? '';
  const category = info?.category ?? '';

  const lastMeeting = report?.lastMeetings?.[0];
  const lastCall = report?.lastCalls?.[0];

  // 1С каже «не найден»? Це може бути mock-clientID або клієнт інших регіонів.
  // Показуємо graceful fallback (name+phone з картки), не червоний банер.
  const isClientNotFound = !!error && /не\s+найден|not\s+found|не\s+знайден/i.test(error);
  const hasFallback = !!(clientNameFallback || phoneFallback);
  const showErrorBanner = !!error && !(isClientNotFound && hasFallback);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[65] bg-emet-ink/40 backdrop-blur-[3px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-[65] bg-white overflow-hidden flex flex-col
            max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:max-h-[90vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[520px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
            data-ending-style:opacity-0 max-md:data-ending-style:translate-y-full md:data-ending-style:scale-95
            data-starting-style:opacity-0 max-md:data-starting-style:translate-y-full md:data-starting-style:scale-95
            transition-all duration-200
          "
        >
          <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
            <DialogPrimitive.Title className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight truncate">
              {name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors shrink-0"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
            {loading && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2Icon className="w-5 h-5 animate-spin mr-2" />
                <span className="text-[13px]">завантажую досьє…</span>
              </div>
            )}

            {showErrorBanner && !loading && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-[12px] text-rose-700">
                Не вдалось завантажити досьє: {error}
              </div>
            )}

            {isClientNotFound && hasFallback && !loading && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[12px] text-amber-800">
                У 1С нема детальної історії для цього коду. Показую базові контакти з картки зустрічі.
              </div>
            )}

            {!loading && (
              <>
                {/* Contact block */}
                <div className="flex flex-col gap-2">
                  {phone && (
                    <a
                      href={`tel:${phoneClean}`}
                      className="inline-flex items-center gap-2.5 text-[14px] font-semibold text-emerald-700 hover:text-emerald-800 group"
                    >
                      <span className="w-9 h-9 rounded-lg bg-emerald-50 inline-flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                        <PhoneIcon className="w-4 h-4" />
                      </span>
                      <span className="font-mono tabular-nums">{phone}</span>
                    </a>
                  )}
                  {address && (
                    <div className="inline-flex items-start gap-2.5 text-[13px] text-slate-700">
                      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">
                        <MapPinIcon className="w-4 h-4 text-slate-500" />
                      </span>
                      <span className="leading-snug pt-1.5">{address}</span>
                    </div>
                  )}
                </div>

                {/* Category */}
                {category && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-500">
                      Категорія
                    </span>
                    <span className="text-[13px] font-semibold text-emet-ink">{category}</span>
                  </div>
                )}

                {/* Last interactions */}
                {(lastMeeting || lastCall) && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-500">
                      Останні взаємодії
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {lastMeeting && (
                        <div className="bg-slate-50 rounded-lg px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            Зустріч
                          </div>
                          <div className="text-[12px] font-bold text-emet-ink mt-0.5 inline-flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3 text-slate-500" />
                            {lastMeeting.date}
                          </div>
                        </div>
                      )}
                      {lastCall && (
                        <div className="bg-slate-50 rounded-lg px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            Дзвінок
                          </div>
                          <div className="text-[12px] font-bold text-emet-ink mt-0.5 inline-flex items-center gap-1">
                            <PhoneIcon className="w-3 h-3 text-emerald-600" />
                            {lastCall.date}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sales summary */}
                {report?.salesReport && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-500">
                      Останні 3 місяці
                    </span>
                    <SalesSummary report={report.salesReport} />
                  </div>
                )}

                {!report && !loading && !error && (
                  <div className="text-[12px] text-slate-500 text-center py-4">
                    Деталі ще не завантажилися або це новий клієнт.
                  </div>
                )}
              </>
            )}
          </div>

          {clientId && (
            <div className="px-5 py-3 md:px-6 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => router.push(`/clients?focus=${encodeURIComponent(clientId)}`)}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-emet-blue hover:bg-emet-blue/5 rounded-xl transition-colors"
              >
                Відкрити повне досьє
                <ExternalLinkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SalesSummary({ report }: { report: NonNullable<ReturnType<typeof useClientReport>['report']>['salesReport'] }) {
  // brand-wise totals for last 3 months (з report.salesReport.brands).
  const entries = (report?.brands ?? [])
    .map(b => [b.brandName ?? '—', Number(b.totalAmount ?? 0)] as [string, number])
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (entries.length === 0) {
    return <div className="text-[12px] text-slate-500">Продажів за останні 3 місяці не зафіксовано.</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([brand, amount]) => (
        <div key={brand} className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-emet-ink inline-flex items-center gap-1.5">
            <TrendingUpIcon className="w-3 h-3 text-teal-600" />
            {brand}
          </span>
          <span className="font-mono tabular-nums text-slate-700">
            ${Math.round(amount).toLocaleString('en-US')}
          </span>
        </div>
      ))}
    </div>
  );
}
