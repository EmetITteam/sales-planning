'use client';

/**
 * ClaimForm — форма створення нової претензії (Sprint A — без файлів).
 *
 * Flow:
 *  1. Менеджер обирає клієнта через `ClientPickerDialog` (свого або глобально).
 *  2. Вказує тип скарги (defect_pack/quality/.../complication) + препарат + LOT.
 *  3. При зміні препарату — динамічно показується анкета (12-14 полів на бренд).
 *  4. Submit → `POST /api/claims` → Bitrix24 SPA 1038 (через server-side).
 *  5. На успіх — toast + редірект назад (TODO: на `/claims/[id]` коли буде Sprint B).
 *
 * UX-конвенції з sales-planning:
 *  - Glass-card на gradient-background (як MeetingsDashboard).
 *  - Поля label-зверху, inputs h-11 з border-emet-blue focus-ring.
 *  - Кнопка «Зберегти» — emet-blue градієнт, disabled поки форма невалідна.
 *  - Tost (через ToastHost — наразі alert якщо нема) на result.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { ClientPickerDialog, type PickedClient } from '@/components/meetings/client-picker-dialog';
import {
  CLAIM_TYPES,
  PRODUCTS,
  type ClaimType,
  type ProductCode,
} from '@/lib/claims/constants';
import { getAnketaForProduct } from '@/lib/claims/anketa-schema';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Search,
} from 'lucide-react';

/** Типи скарг, для яких показуємо медичну анкету. Інші (брак/упаковка) — без. */
const MEDICAL_CLAIM_TYPES: ClaimType[] = ['side_effect', 'complication'];

interface SubmitState {
  loading: boolean;
  result: { ok: boolean; message: string; claimId?: number; link?: string } | null;
}

export function ClaimForm() {
  const router = useRouter();
  const user = useAppStore(s => s.user);

  const [picker, setPicker] = useState(false);
  const [client, setClient] = useState<PickedClient | null>(null);
  const [claimType, setClaimType] = useState<ClaimType | ''>('');
  const [product, setProduct] = useState<ProductCode | ''>('');
  const [lot, setLot] = useState('');
  const [invoice, setInvoice] = useState('');
  const [anketa, setAnketa] = useState<Record<string, string>>({});
  const [submit, setSubmit] = useState<SubmitState>({ loading: false, result: null });

  // Динамічна анкета — залежить від обраного продукту і чи скарга медична.
  const isMedicalClaim = claimType && MEDICAL_CLAIM_TYPES.includes(claimType as ClaimType);
  const anketaFields = useMemo(() => {
    if (!product || !isMedicalClaim) return [];
    return getAnketaForProduct(product as ProductCode);
  }, [product, isMedicalClaim]);

  // Валідація для disable кнопки.
  const canSubmit = !!(
    client &&
    claimType &&
    product &&
    lot.trim() &&
    !submit.loading
  );

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
    } catch (e) {
      setSubmit({
        loading: false,
        result: { ok: false, message: (e as Error).message },
      });
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-emet-blue transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Назад
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-sm">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-bold tracking-tight text-emet-ink">Нова рекламація</h1>
          <p className="text-[12px] text-muted-foreground">
            Скаргa йде у Bitrix мед-відділу для опрацювання. Менеджер: <strong>{user.fullName}</strong>
          </p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white border border-[#e2e7ef] rounded-2xl p-5 md:p-6 shadow-sm space-y-5">
        {/* Клієнт */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold uppercase tracking-[0.6px] text-slate-600">
            Клієнт <span className="text-rose-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="w-full flex items-center gap-2 px-4 h-11 rounded-[10px] border border-slate-200 bg-white/85 hover:border-emet-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 text-left transition-colors"
          >
            <Search className="w-4 h-4 text-emet-blue shrink-0" />
            <span className="flex-1 text-[14px] truncate">
              {client ? (
                <>
                  <span className="font-semibold text-emet-ink">{client.clientName}</span>
                  {client.phone && <span className="text-muted-foreground"> · {client.phone}</span>}
                </>
              ) : (
                <span className="text-muted-foreground">Оберіть клієнта…</span>
              )}
            </span>
            {client && <span className="text-[12px] text-emet-blue font-semibold">Змінити</span>}
          </button>
        </div>

        {/* Тип скарги + Препарат */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold uppercase tracking-[0.6px] text-slate-600">
              Тип скарги <span className="text-rose-500">*</span>
            </label>
            <select
              value={claimType}
              onChange={e => setClaimType(e.target.value as ClaimType)}
              className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
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
            <label className="text-[12px] font-bold uppercase tracking-[0.6px] text-slate-600">
              Препарат <span className="text-rose-500">*</span>
            </label>
            <select
              value={product}
              onChange={e => {
                setProduct(e.target.value as ProductCode);
                setAnketa({}); // скидаємо анкету бо схема могла змінитись
              }}
              className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold uppercase tracking-[0.6px] text-slate-600">
              LOT (партія) <span className="text-rose-500">*</span>
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
            <label className="text-[12px] font-bold uppercase tracking-[0.6px] text-slate-600">
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

        {/* Анкета (тільки для медичних скарг + обраний препарат) */}
        {anketaFields.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-[#e2e7ef]">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-emet-ink">
                Медична анкета · {PRODUCTS[product as ProductCode]}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {anketaFields.length} полів
              </span>
            </div>

            <div className="space-y-3.5">
              {anketaFields.map(field => (
                <div key={field.id} className="space-y-1">
                  <label className="text-[12px] font-medium text-slate-700">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={anketa[field.id] ?? ''}
                      onChange={e => setAnketa(s => ({ ...s, [field.id]: e.target.value }))}
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all resize-y min-h-[60px]"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={anketa[field.id] ?? ''}
                      onChange={e => setAnketa(s => ({ ...s, [field.id]: e.target.value }))}
                      className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
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
                      className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 bg-white/85 text-[14px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all"
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

        {/* Submit */}
        <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 px-5 rounded-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-[14px] font-semibold transition-colors"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-11 px-6 rounded-[10px] bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {submit.loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Надсилаю…
              </>
            ) : (
              'Створити рекламацію'
            )}
          </button>
        </div>
      </div>

      <ClientPickerDialog
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={c => {
          setClient(c);
          setPicker(false);
        }}
        selectedClientId={client?.clientId1c}
      />
    </div>
  );
}
