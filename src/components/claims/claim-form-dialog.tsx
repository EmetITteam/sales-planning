'use client';

/**
 * ClaimFormDialog — модальне вікно створення нової претензії.
 *
 * UX 1-в-1 з MeetingForm (bottom-sheet на mobile, центрована modal на desktop).
 * Викликається з:
 *  - тулбара /claims (кнопка «Нова рекламація»)
 *  - картки клієнта /clients (з prefilled клієнтом)  — Sprint C
 *  - картки зустрічі /meetings (з prefilled клієнтом + meetingId) — Sprint C
 *
 * Flow:
 *  1. Менеджер обирає клієнта через `ClientPickerDialog`.
 *  2. Тип скарги + препарат + LOT + invoice.
 *  3. При зміні препарату або типу — показується/ховається мед. анкета
 *     (тільки для side_effect / complication / effectiveness — як в reclamation-app).
 *  4. Submit → POST /api/claims → Bitrix24 SPA 1038.
 *  5. onCreated(id, link) — caller може показати toast / редірект.
 */

import { useMemo, useState, useEffect } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ClientPickerDialog, type PickedClient } from '@/components/meetings/client-picker-dialog';
import {
  CLAIM_TYPES,
  PRODUCTS,
  type ClaimType,
  type ProductCode,
} from '@/lib/claims/constants';
import { getAnketaForProduct } from '@/lib/claims/anketa-schema';

/**
 * Типи скарг, для яких показуємо медичну анкету.
 * Список з reclamation-app/public/index.html:907 — НЕ змінювати без узгодження
 * з мед-відділом.
 */
const MEDICAL_CLAIM_TYPES: ClaimType[] = ['side_effect', 'complication', 'effectiveness'];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Викликається після успішного створення claim. caller показує toast/refresh. */
  onCreated?: (claimId: number, link: string) => void;
  /** Якщо відкрито з картки клієнта/зустрічі — prefill. */
  prefilledClient?: PickedClient | null;
  /** ID нашої зустрічі (для майбутнього поля у Bitrix або у нашій БД). */
  prefilledMeetingId?: string | null;
}

interface SubmitState {
  loading: boolean;
  result: { ok: boolean; message: string; claimId?: number; link?: string } | null;
}

export function ClaimFormDialog({
  open,
  onClose,
  onCreated,
  prefilledClient,
  prefilledMeetingId,
}: Props) {
  const user = useAppStore(s => s.user);

  const [picker, setPicker] = useState(false);
  const [client, setClient] = useState<PickedClient | null>(null);
  const [claimType, setClaimType] = useState<ClaimType | ''>('');
  const [product, setProduct] = useState<ProductCode | ''>('');
  const [lot, setLot] = useState('');
  const [invoice, setInvoice] = useState('');
  const [anketa, setAnketa] = useState<Record<string, string>>({});
  const [submit, setSubmit] = useState<SubmitState>({ loading: false, result: null });

  // Reset на відкриття. Якщо prefilledClient — підставляємо.
  useEffect(() => {
    if (open) {
      setClient(prefilledClient ?? null);
      setClaimType('');
      setProduct('');
      setLot('');
      setInvoice('');
      setAnketa({});
      setSubmit({ loading: false, result: null });
    }
  }, [open, prefilledClient]);

  // Анкета показується тільки для медичних типів + обраного препарату.
  const isMedicalClaim = !!(claimType && MEDICAL_CLAIM_TYPES.includes(claimType as ClaimType));
  const anketaFields = useMemo(() => {
    if (!product || !isMedicalClaim) return [];
    return getAnketaForProduct(product as ProductCode);
  }, [product, isMedicalClaim]);

  const canSubmit = !!(client && claimType && product && lot.trim() && !submit.loading);

  const handleSubmit = async () => {
    if (!canSubmit || !client || !claimType || !product) return;
    setSubmit({ loading: true, result: null });
    try {
      const r = await fetch('/api/claims', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: client.clientName,
          clientId1c: client.clientId1c,
          meetingId: prefilledMeetingId ?? null,
          claimType,
          product,
          lot: lot.trim(),
          invoice: invoice.trim() || null,
          anketa,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        id?: number;
        link?: string;
        error?: string;
      };
      if (!r.ok || body.error) {
        setSubmit({
          loading: false,
          result: { ok: false, message: body.error ?? `HTTP ${r.status}` },
        });
        return;
      }
      setSubmit({
        loading: false,
        result: {
          ok: true,
          message: `Рекламацію №${body.id} створено`,
          claimId: body.id,
          link: body.link,
        },
      });
      if (body.id && body.link) onCreated?.(body.id, body.link);
    } catch (e) {
      setSubmit({
        loading: false,
        result: { ok: false, message: (e as Error).message },
      });
    }
  };

  if (!user) return null;

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={v => !v && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
          <DialogPrimitive.Popup
            className="
              fixed z-50 bg-white overflow-hidden flex flex-col
              max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:max-h-[92vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
              md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[640px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
              data-ending-style:opacity-0 max-md:data-ending-style:translate-y-full md:data-ending-style:scale-95
              data-starting-style:opacity-0 max-md:data-starting-style:translate-y-full md:data-starting-style:scale-95
              transition-all duration-200
            "
          >
            {/* Mobile grabber */}
            <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 md:py-4 md:px-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <DialogPrimitive.Title className="text-[17px] md:text-[19px] font-bold text-emet-ink tracking-tight truncate">
                  Нова рекламація
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close
                className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors shrink-0"
                aria-label="Закрити"
              >
                <XIcon className="w-[18px] h-[18px]" />
              </DialogPrimitive.Close>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
              <p className="text-[12px] text-muted-foreground -mt-1">
                Скарга йде у Bitrix мед-відділу для опрацювання. Менеджер:{' '}
                <strong className="text-emet-ink">{user.fullName}</strong>
              </p>

              {/* Клієнт */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                  Клієнт <span className="text-emet-blue">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setPicker(true)}
                  className="w-full flex items-center gap-2 px-3.5 h-11 rounded-[10px] border border-slate-200 bg-white/85 hover:border-emet-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 text-left transition-colors"
                >
                  <span className="flex-1 text-[14px] truncate">
                    {client ? (
                      <>
                        <span className="font-semibold text-emet-ink">{client.clientName}</span>
                        {client.phone && (
                          <span className="text-muted-foreground"> · {client.phone}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Оберіть клієнта…</span>
                    )}
                  </span>
                  <span className="text-[12px] text-emet-blue font-semibold">
                    {client ? 'Змінити' : 'Обрати'}
                  </span>
                </button>
              </div>

              {/* Тип + Препарат */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                    Тип скарги <span className="text-emet-blue">*</span>
                  </label>
                  <select
                    value={claimType}
                    onChange={e => setClaimType(e.target.value as ClaimType)}
                    className="w-full h-11 px-3 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                  >
                    <option value="">— Обрати —</option>
                    {(Object.keys(CLAIM_TYPES) as ClaimType[]).map(k => (
                      <option key={k} value={k}>
                        {CLAIM_TYPES[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                    Препарат <span className="text-emet-blue">*</span>
                  </label>
                  <select
                    value={product}
                    onChange={e => {
                      setProduct(e.target.value as ProductCode);
                      setAnketa({});
                    }}
                    className="w-full h-11 px-3 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                  >
                    <option value="">— Обрати —</option>
                    {(Object.keys(PRODUCTS) as ProductCode[]).map(k => (
                      <option key={k} value={k}>
                        {PRODUCTS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* LOT + Invoice */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                    LOT (партія) <span className="text-emet-blue">*</span>
                  </label>
                  <input
                    type="text"
                    value={lot}
                    onChange={e => setLot(e.target.value)}
                    placeholder="Напр. 240615A"
                    className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                    № Реалізації
                  </label>
                  <input
                    type="text"
                    value={invoice}
                    onChange={e => setInvoice(e.target.value)}
                    placeholder="Не обов'язково"
                    className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                  />
                </div>
              </div>

              {/* Підказка: для нем-медичних типів пояснюємо чому нема анкети */}
              {claimType && !isMedicalClaim && (
                <div className="text-[12px] text-muted-foreground bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  Для типу «{CLAIM_TYPES[claimType as ClaimType]}» медична анкета не потрібна.
                  Деталі скарги уточнить мед-відділ у Bitrix через чат.
                </div>
              )}

              {/* Динамічна анкета */}
              {anketaFields.length > 0 && (
                <div className="space-y-3.5 pt-2 border-t border-[#e2e7ef]">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-bold text-emet-ink">
                      Медична анкета · {PRODUCTS[product as ProductCode]}
                    </h3>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      {anketaFields.length} полів
                    </span>
                  </div>

                  <div className="space-y-3">
                    {anketaFields.map(field => (
                      <div key={field.id} className="space-y-1">
                        <label className="text-[12px] font-medium text-slate-700">
                          {field.label}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            value={anketa[field.id] ?? ''}
                            onChange={e => setAnketa(s => ({ ...s, [field.id]: e.target.value }))}
                            rows={2}
                            className="w-full px-3.5 py-2.5 rounded-[10px] border border-slate-200 bg-white/85 text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all resize-y min-h-[56px]"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            value={anketa[field.id] ?? ''}
                            onChange={e => setAnketa(s => ({ ...s, [field.id]: e.target.value }))}
                            className="w-full h-10 px-3 rounded-[10px] border border-slate-200 bg-white/85 text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                          >
                            <option value="">— Обрати —</option>
                            {field.options?.map(opt => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            value={anketa[field.id] ?? ''}
                            onChange={e => setAnketa(s => ({ ...s, [field.id]: e.target.value }))}
                            className="w-full h-10 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result banner */}
              {submit.result && (
                <div
                  className={`px-4 py-3 rounded-xl text-[13px] flex items-start gap-2 ${
                    submit.result.ok
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700'
                  }`}
                  role="status"
                >
                  {submit.result.ok ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold">{submit.result.message}</div>
                    {submit.result.ok && submit.result.link && (
                      <a
                        href={submit.result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-emerald-700 underline mt-0.5 inline-block"
                      >
                        Відкрити у Bitrix
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2.5 px-5 py-3.5 md:px-6 md:py-4 border-t border-slate-100 shrink-0 bg-white">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] px-4 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[14px] font-bold hover:bg-slate-200 active:translate-y-px transition-all"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {submit.loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Надсилаю…
                  </>
                ) : submit.result?.ok ? (
                  'Готово'
                ) : (
                  'Створити'
                )}
              </button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <ClientPickerDialog
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={c => {
          setClient(c);
          setPicker(false);
        }}
        selectedClientId={client?.clientId1c}
      />
    </>
  );
}
