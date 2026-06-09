'use client';

/**
 * ClaimFormDialog — модальне вікно створення нової претензії.
 *
 * Bottom-sheet на mobile, центрована modal на desktop. UX 1-в-1 з MeetingForm.
 *
 * Структура (переноситься 1-в-1 з reclamation-app/public/index.html renderDynamicForm):
 *  - Клієнт (через ClientPickerDialog)
 *  - Тип скарги + Препарат
 *  - LOT + Invoice
 *  - [якщо product=OTHER] поле «Вкажіть назву продукту»
 *  - [якщо тип медичний] повна анкета по бренду (13-14 полів)
 *  - [якщо тип НЕ медичний] textarea «Опишіть суть невідповідності якості»
 *    (або «Опишіть суть проблеми / браку»)
 *  - Медіа-докази (фото/відео) — multipart upload через наш API → Bitrix
 *
 * Submit → POST /api/claims (multipart/form-data) → Bitrix24 SPA 1038.
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, AlertCircle, CheckCircle2, Loader2, Upload, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { ClientPickerDialog, type PickedClient } from '@/components/meetings/client-picker-dialog';
import {
  CLAIM_TYPES,
  PRODUCTS,
  type ClaimType,
  type ProductCode,
} from '@/lib/claims/constants';
import { getAnketaForProduct, MEDICAL_CLAIM_TYPES } from '@/lib/claims/anketa-schema';
import { AttachmentLightbox } from './attachment-lightbox';
import type { ClaimAttachment } from '@/lib/claims/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Викликається після успішного створення claim. Caller показує toast/refresh. */
  onCreated?: (claimId: number, link: string) => void;
  /** Якщо відкрито з картки клієнта/зустрічі — prefill. */
  prefilledClient?: PickedClient | null;
  /** ID нашої зустрічі (передається у Bitrix у details як reference). */
  prefilledMeetingId?: string | null;
}

interface SubmitState {
  loading: boolean;
  result: { ok: boolean; message: string; claimId?: number; link?: string } | null;
}

const MAX_TOTAL_SIZE_MB = 4; // Vercel body-limit safe: 4.5MB - overhead
const MAX_FILES = 8;

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
  const [otherProductName, setOtherProductName] = useState('');
  const [simpleDesc, setSimpleDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submit, setSubmit] = useState<SubmitState>({ loading: false, result: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox для прев'ю локальних файлів (до відправки). ObjectURL revoke
  // при закритті щоб не текли memory.
  const [openedPreview, setOpenedPreview] = useState<ClaimAttachment | null>(null);
  const closePreview = () => {
    if (openedPreview?.url.startsWith('blob:')) {
      URL.revokeObjectURL(openedPreview.url);
    }
    setOpenedPreview(null);
  };
  const previewFile = (f: File) => {
    const kind: ClaimAttachment['kind'] = f.type.startsWith('image/')
      ? 'image'
      : f.type.startsWith('video/')
        ? 'video'
        : 'other';
    setOpenedPreview({ url: URL.createObjectURL(f), name: f.name, kind });
  };

  // Reset на відкриття.
  useEffect(() => {
    if (open) {
      setClient(prefilledClient ?? null);
      setClaimType('');
      setProduct('');
      setLot('');
      setInvoice('');
      setAnketa({});
      setOtherProductName('');
      setSimpleDesc('');
      setFiles([]);
      setSubmit({ loading: false, result: null });
    }
  }, [open, prefilledClient]);

  const isMedicalClaim = !!(claimType && (MEDICAL_CLAIM_TYPES as readonly string[]).includes(claimType));
  const anketaFields = useMemo(() => {
    if (!product || !isMedicalClaim) return [];
    return getAnketaForProduct(product as ProductCode);
  }, [product, isMedicalClaim]);

  // Validation
  const totalFileSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);
  const filesOverLimit = totalFileSize > MAX_TOTAL_SIZE_MB * 1024 * 1024;

  const canSubmit = !!(
    client &&
    claimType &&
    product &&
    lot.trim() &&
    (product !== 'OTHER' || otherProductName.trim()) &&
    (isMedicalClaim || simpleDesc.trim()) &&
    !filesOverLimit &&
    !submit.loading
  );

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const incoming = Array.from(newFiles);
    setFiles(prev => [...prev, ...incoming].slice(0, MAX_FILES));
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit || !client || !claimType || !product) return;
    setSubmit({ loading: true, result: null });
    try {
      // Multipart FormData — щоб файли йшли як бінарні, не base64.
      // Сервер їх читає → base64-encode → відправляє у Bitrix `crm.item.add`.
      const fd = new FormData();
      fd.append('client', client.clientName);
      fd.append('clientId1c', client.clientId1c || '');
      fd.append('meetingId', prefilledMeetingId || '');
      fd.append('claimType', claimType);
      fd.append('product', product);
      fd.append('lot', lot.trim());
      fd.append('invoice', invoice.trim());
      fd.append('otherProductName', otherProductName.trim());
      fd.append('simpleDesc', simpleDesc.trim());
      fd.append('anketa', JSON.stringify(anketa));
      for (const f of files) fd.append('files', f, f.name);

      const r = await fetch('/api/claims', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
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
      // Auto-close через 2.5с — юзер встигає прочитати success-banner у top
      // модалки. Раніше було 1.5с і banner у body, юзер не помічав. 2026-06-10.
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (e) {
      setSubmit({
        loading: false,
        result: { ok: false, message: (e as Error).message },
      });
    }
  };

  if (!user) return null;

  // Лейбл textarea для не-медичних типів (з оригіналу).
  const simpleDescLabel =
    claimType === 'quality'
      ? 'Опишіть суть невідповідності якості'
      : 'Опишіть суть проблеми / браку';

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
            <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

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

            {/* Success banner — НАГОРІ модалки. Раніше був у body внизу разом
                з кнопкою «Готово» — юзер не бачив повідомлення, форма просто
                «зникала». Тепер видно одразу при success. */}
            {submit.result?.ok && (
              <div
                className="px-5 md:px-6 py-3 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-[14px] font-semibold flex items-center gap-2 shrink-0"
                role="status"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{submit.result.message}</span>
              </div>
            )}

            {/* Body — scrollable. ⚠️ min-h-0 ОБОВ'ЯЗКОВО на flex-1 child
                всередині flex-col, інакше overflow-y-auto не працює і весь
                контент розпихає dialog за межі viewport. */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
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
                      setOtherProductName('');
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

              {/* Якщо product=OTHER — обов'язкова назва продукту */}
              {product === 'OTHER' && (
                <div className="space-y-1.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-amber-900">
                    Вкажіть назву продукту <span className="text-emet-blue">*</span>
                  </label>
                  <input
                    type="text"
                    value={otherProductName}
                    onChange={e => setOtherProductName(e.target.value)}
                    placeholder="Наприклад: Крем під очі..."
                    className="w-full h-10 px-3.5 rounded-[8px] border border-amber-200 bg-white text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
                  />
                </div>
              )}

              {/* Динамічна анкета для медичних типів */}
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

              {/* Простий опис для не-медичних типів */}
              {claimType && !isMedicalClaim && (
                <div className="space-y-3.5 pt-2 border-t border-[#e2e7ef]">
                  <h3 className="text-[13px] font-bold text-emet-ink">Деталі інциденту</h3>
                  <div className="space-y-1">
                    <label className="text-[12px] font-medium text-slate-700">
                      {simpleDescLabel} <span className="text-emet-blue">*</span>
                    </label>
                    <textarea
                      value={simpleDesc}
                      onChange={e => setSimpleDesc(e.target.value)}
                      rows={4}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-slate-200 bg-white/85 text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all resize-y min-h-[100px]"
                    />
                  </div>
                </div>
              )}

              {/* Файли (Sprint A.4) */}
              <div className="space-y-2 pt-2 border-t border-[#e2e7ef]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-emet-ink">Медіа-докази</h3>
                  <span className="text-[10px] text-muted-foreground">
                    Макс {MAX_FILES} файлів, до {MAX_TOTAL_SIZE_MB}MB сумарно
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-[10px] border-2 border-dashed border-slate-300 bg-slate-50 hover:border-emet-blue hover:bg-emet-blue/5 transition-colors"
                >
                  <Upload className="w-5 h-5 text-emet-blue" />
                  <span className="text-[13px] font-semibold text-emet-ink">
                    Додати фото / відео
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Клацніть або перетягніть файли сюди
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={e => handleFiles(e.target.files)}
                />

                {files.length > 0 && (
                  <div className="space-y-1.5">
                    {files.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200"
                      >
                        <button
                          type="button"
                          onClick={() => previewFile(f)}
                          title="Подивитись прев'ю"
                          className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden hover:border-emet-blue transition-colors"
                        >
                          {f.type.startsWith('image/') ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={URL.createObjectURL(f)}
                              alt={f.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500">VID</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => previewFile(f)}
                          className="flex-1 min-w-0 text-left hover:text-emet-blue transition-colors"
                        >
                          <div className="text-[12px] font-medium truncate">{f.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {(f.size / 1024).toFixed(0)} KB
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="w-7 h-7 rounded-md hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0"
                          aria-label="Видалити"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {filesOverLimit && (
                      <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        Сумарний розмір файлів {(totalFileSize / 1024 / 1024).toFixed(1)}MB
                        перевищує ліміт {MAX_TOTAL_SIZE_MB}MB. Видаліть кілька або стисніть.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Error banner (success — у sticky top, бачимо вище) */}
              {submit.result && !submit.result.ok && (
                <div
                  className="px-4 py-3 rounded-xl text-[13px] flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700"
                  role="status"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold">{submit.result.message}</div>
                  </div>
                </div>
              )}
            </div>

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
                onClick={submit.result?.ok ? onClose : handleSubmit}
                disabled={submit.result?.ok ? false : !canSubmit}
                className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {submit.loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Надсилаю…
                  </>
                ) : submit.result?.ok ? (
                  'Закрити'
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

      {/* Lightbox для прев'ю обраних, ще не відправлених файлів */}
      <AttachmentLightbox attachment={openedPreview} onClose={closePreview} />
    </>
  );
}
