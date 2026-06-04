/**
 * NewClientDialog — модал створення нового клієнта (порту з meeting-app
 * handleSaveNewClient).
 *
 * Шле у 1С через `registerNewClient` action:
 *  - name, phone, address, education
 *  - files: масив `{name, type, contentBase64}` (multi-upload)
 *
 * Файли читаються через FileReader.readAsDataURL → відрізаємо `data:...;base64,`
 * префікс → лишається pure base64 контент.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, CheckIcon, Loader2Icon, UploadIcon, FileTextIcon, Trash2Icon, AlertTriangleIcon, ExternalLinkIcon } from 'lucide-react';
import { callOneC } from '@/lib/onec-client';
import { useOneCData } from '@/lib/use-onec-data';
import { useAppStore } from '@/lib/store';
import { getClientName, type ClientFromOneC } from '@/lib/mityng-types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback після успішного створення — caller може refetch myClients. */
  onCreated: (createdName: string) => void;
  /**
   * Викликається коли менеджер у duplicate-warning натискає «Відкрити мого
   * клієнта» (тобто схожий клієнт уже існує і він СВІЙ). Сторінка фокусує
   * картку, діалог закривається. Якщо не передано — кнопка прихована.
   */
  onOpenExistingClient?: (clientId: string) => void;
}

interface PickedFile {
  file: File;
  size: number;
}

const EDUCATION_OPTIONS: string[] = [
  'Высшее мед.',
  'Средне мед.',
  'Клиника',
  'Без.мед образования',
];

/** Читає file → pure base64 (без префіксу `data:...;base64,`). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx > 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
}

const PHONE_MASK_PATTERN = /^\+38\d{10}$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Якщо вже +38XXXXXXXXXX
  if (digits.startsWith('38') && digits.length === 12) return `+${digits}`;
  // 0XXXXXXXXX → +380XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
  return `+${digits}`;
}

const DUPLICATE_DEBOUNCE_MS = 400;
const DUPLICATE_MIN_CHARS = 3;
const DUPLICATE_MAX_SHOW = 5;

export function NewClientDialog({ open, onClose, onCreated, onOpenExistingClient }: Props) {
  const sessionUser = useAppStore(s => s.user);
  const myLogin = (sessionUser?.login ?? '').toLowerCase().trim();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [education, setEducation] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedName, setDebouncedName] = useState('');
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setPhone('');
      setAddress('');
      setEducation('');
      setFiles([]);
      setError(null);
      setDebouncedName('');
      setDuplicatesDismissed(false);
    }
  }, [open]);

  // Debounced findClient: коли менеджер пише ім'я ≥ 3 символи, шукаємо у ВСІЙ
  // базі компанії. Soft warning — не блокує створення, тільки попереджає що
  // такий клієнт, можливо, вже є (у когось іншого або у нього самого).
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < DUPLICATE_MIN_CHARS) {
      setDebouncedName('');
      return;
    }
    const t = setTimeout(() => setDebouncedName(trimmed), DUPLICATE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [name]);

  const shouldSearchDuplicates = open && !saving && debouncedName.length >= DUPLICATE_MIN_CHARS;
  const { data: dupData, loading: dupLoading } = useOneCData(
    'findClient',
    shouldSearchDuplicates ? { searchTerm: debouncedName, managerLogin: '' } : null,
  );
  const duplicates: ClientFromOneC[] = useMemo(() => {
    const arr: ClientFromOneC[] = dupData?.clients ?? [];
    return arr.slice(0, DUPLICATE_MAX_SHOW);
  }, [dupData]);
  const duplicatesTotal: number = dupData?.clients?.length ?? 0;

  const canSave = name.trim().length > 0 && phone.trim().length > 0 && !saving;

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const next: PickedFile[] = [];
    for (const f of Array.from(list)) {
      next.push({ file: f, size: f.size });
    }
    setFiles(prev => [...prev, ...next]);
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!canSave) return;
    const normalized = normalizePhone(phone);
    if (!PHONE_MASK_PATTERN.test(normalized)) {
      setError('Телефон має бути у форматі +380XXXXXXXXX (10 цифр після +38).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const encoded = await Promise.all(
        files.map(async pf => ({
          name: pf.file.name,
          type: pf.file.type,
          contentBase64: await fileToBase64(pf.file),
        })),
      );
      const result = await callOneC('registerNewClient', {
        name: name.trim(),
        phone: normalized,
        address: address.trim(),
        education: education.trim(),
        managerLogin: '', // override з сесії на бекенді
        files: encoded,
      });
      onCreated(result?.ClientName ?? name.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Не вдалось створити клієнта');
    } finally {
      setSaving(false);
    }
  };

  const totalSizeKb = Math.round(files.reduce((s, f) => s + f.size, 0) / 1024);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && !saving && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-50 bg-white overflow-hidden flex flex-col
            max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:max-h-[92vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[560px] md:max-w-[calc(100vw-32px)] md:max-h-[calc(100vh-64px)] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
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
              Новий клієнт
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              disabled={saving}
              className="w-11 h-11 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors disabled:opacity-50"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                Назва клініки / ПІБ <span className="text-emet-blue">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setDuplicatesDismissed(false); }}
                  placeholder="Іванова Олена Петрівна"
                  className="w-full text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all"
                />
                {dupLoading && shouldSearchDuplicates && (
                  <Loader2Icon className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
                )}
              </div>

              {/* Duplicate warning — soft, не блокує. Показуємо тільки якщо
                  знайшли хоча б 1 матч і користувач не натиснув «Все одно
                  створити». */}
              {shouldSearchDuplicates && !dupLoading && duplicates.length > 0 && !duplicatesDismissed && (
                <div className="mt-1 bg-amber-50/80 border border-amber-200 rounded-xl px-3.5 py-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-amber-900">
                        Знайдено схожих клієнтів у базі — перевірте чи це не дублікат
                      </div>
                      <div className="text-[11px] text-amber-800/80 mt-0.5">
                        {duplicatesTotal === 1
                          ? '1 збіг'
                          : `${duplicates.length}${duplicatesTotal > duplicates.length ? ` з ${duplicatesTotal}` : ''} збігів`}
                        {' · '}клікніть для перегляду
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {duplicates.map(c => {
                      const dupName = getClientName(c);
                      const dupManager = c.managerName?.trim() || '';
                      const isMine = c.isMine === true || (!!dupManager && dupManager.toLowerCase() === myLogin);
                      return (
                        <div
                          key={c.ClientID}
                          className="bg-white/70 border border-amber-200/60 rounded-lg px-2.5 py-2 flex items-center gap-2 min-w-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-emet-ink truncate">
                              {dupName}
                            </div>
                            <div className="text-[10.5px] text-slate-600 truncate">
                              {isMine
                                ? 'Це ваш клієнт'
                                : `Менеджер: ${dupManager || 'Не призначено'}`}
                            </div>
                          </div>
                          {isMine && onOpenExistingClient && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenExistingClient(c.ClientID);
                                onClose();
                              }}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emet-blue text-white text-[10.5px] font-bold hover:bg-emet-blue-light transition-colors"
                            >
                              <ExternalLinkIcon className="w-3 h-3" />
                              Відкрити
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDuplicatesDismissed(true)}
                    className="self-start text-[11px] font-semibold text-amber-900 hover:text-amber-700 underline underline-offset-2"
                  >
                    Не дублікат — створити нового
                  </button>
                </div>
              )}
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                Телефон <span className="text-emet-blue">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+380XXXXXXXXX"
                className="w-full font-mono text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all"
              />
              <span className="text-[11px] text-slate-500">Формат: +38XXXXXXXXXX або 0XXXXXXXXX</span>
            </div>

            {/* Address */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                Адреса
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="вул. Хорива 42, Київ"
                className="w-full text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all"
              />
            </div>

            {/* Education */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                Освіта
              </label>
              <select
                value={education}
                onChange={e => setEducation(e.target.value)}
                className="w-full text-[14px] text-emet-ink bg-white/85 border border-slate-200 rounded-[10px] px-3.5 py-3 min-h-[44px] outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all"
              >
                <option value="">— оберіть —</option>
                {EDUCATION_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* Files */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                Документи <span className="text-slate-400 font-medium normal-case tracking-normal ml-1">(паспорт, диплом, сертифікати)</span>
              </label>
              <label className="cursor-pointer inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-emet-blue hover:bg-emet-blue/5 text-[13px] font-semibold text-slate-600 transition-all">
                <UploadIcon className="w-4 h-4" />
                Додати файли
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleFiles(e.target.files)}
                />
              </label>
              {files.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  {files.map((pf, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <FileTextIcon className="w-4 h-4 text-emet-blue shrink-0" />
                      <span className="flex-1 min-w-0 text-[12px] font-semibold text-emet-ink truncate">
                        {pf.file.name}
                      </span>
                      <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
                        {Math.round(pf.size / 1024)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="w-7 h-7 rounded-md hover:bg-rose-50 text-slate-500 hover:text-rose-600 inline-flex items-center justify-center shrink-0"
                        aria-label="Видалити"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="text-[11px] text-slate-500 mt-1">
                    Всього: {files.length} файл{files.length === 1 ? '' : 'и'} · {totalSizeKb} KB
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 text-[12px] text-rose-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-2.5 px-5 py-3.5 md:px-6 md:py-4 border-t border-slate-100 shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-[14px] font-bold hover:bg-slate-200 active:translate-y-px transition-all disabled:opacity-50"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Зберігаю…' : 'Створити'}
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
