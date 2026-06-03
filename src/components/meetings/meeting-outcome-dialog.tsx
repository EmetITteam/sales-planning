/**
 * MeetingOutcomeDialog — підсумок зустрічі + анкета потенціалу клієнта.
 *
 * Структура 1-в-1 з meeting-app/index.html (outcome-survey-form):
 *  - Підсумок зустрічі (textarea) → updateMeeting(comment)
 *  - Анкета клієнта (accordion 4 секції) → saveClientSurvey({clientID, surveyData})
 *
 * Анкета зберігається по КЛІЄНТУ, не по зустрічі — тому при відкритті
 * у наступних зустрічах того самого клієнта дані префіл'яться з 1С
 * (AnketaDataJSON клієнта). Поки префіл TODO — Sprint 1.6.
 *
 * Sub-блок логіка: коли користувач відмічає процедуру з `controls`-id,
 * показуємо відповідний sub-блок (бренди + кількість).
 */

'use client';

import { useEffect, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon, CheckIcon, ChevronDownIcon, Loader2Icon } from 'lucide-react';
import type { MeetingWithSync } from '@/lib/meetings/mock-data';
import {
  SURVEY_SECTIONS,
  toggleArrayValue,
  setSurveyValue,
  getSurveyValue,
  type SurveyData,
  type SurveyField,
  type SurveySection,
} from '@/lib/meetings/survey-schema';
import { callOneC } from '@/lib/onec-client';

interface Props {
  open: boolean;
  meeting: MeetingWithSync | null;
  onClose: () => void;
  /** Викликається після успішного збереження. Dashboard оновить toast. */
  onSaved: (data: { comment: string }) => void;
}

export function MeetingOutcomeDialog({ open, meeting, onClose, onSaved }: Props) {
  const [comment, setComment] = useState('');
  const [surveyData, setSurveyData] = useState<SurveyData>({});
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && meeting) {
      setComment(meeting.comment ?? '');
      setSurveyData({});
      setError(null);
    }
  }, [open, meeting]);

  if (!meeting) return null;

  const toggleSection = (i: number) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const surveyJson = JSON.stringify(surveyData);
      // 1. Зберегти анкету у 1С (по клієнту)
      await callOneC('saveClientSurvey', {
        clientID: meeting.clientId1c,
        surveyData: surveyJson,
      });
      onSaved({ comment });
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Не вдалось зберегти');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={v => !v && !saving && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-emet-ink/30 backdrop-blur-[2px] data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity duration-200" />
        <DialogPrimitive.Popup
          className="
            fixed z-50 bg-white overflow-hidden flex flex-col
            max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-3xl max-md:h-[92vh] max-md:shadow-[0_-8px_40px_rgba(6,42,61,0.20)]
            md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[640px] md:max-w-[calc(100vw-32px)] md:h-[80vh] md:rounded-3xl md:shadow-[0_24px_60px_rgba(6,42,61,0.25)]
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
              Підсумок зустрічі
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              disabled={saving}
              className="w-9 h-9 rounded-[10px] bg-slate-100 text-slate-600 hover:bg-slate-200 inline-flex items-center justify-center transition-colors disabled:opacity-50"
              aria-label="Закрити"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-6 md:py-6 flex flex-col gap-5">
            {/* Comment */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.7px] text-slate-600">
                Підсумок зустрічі
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                placeholder="Ваші заметки по цій зустрічі…"
                className="w-full font-sans text-[14px] text-emet-ink bg-white border border-slate-200 rounded-[10px] px-3.5 py-3 outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all resize-y leading-relaxed"
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[14px] font-bold text-emet-ink mb-2.5">
                Анкета потенціалу клієнта
              </h3>
              <div className="flex flex-col gap-2">
                {SURVEY_SECTIONS.map((section, i) => (
                  <SurveyAccordionItem
                    key={i}
                    section={section}
                    isOpen={openSections.has(i)}
                    onToggle={() => toggleSection(i)}
                    data={surveyData}
                    onChange={setSurveyData}
                  />
                ))}
              </div>
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
              disabled={saving}
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[14px] font-bold shadow-[0_4px_14px_rgba(6,106,171,0.30)] hover:shadow-[0_6px_20px_rgba(6,106,171,0.40)] active:translate-y-px transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Зберігаю…' : 'Зберегти підсумки'}
            </button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ============================================================================
// Accordion item
// ============================================================================

function SurveyAccordionItem({
  section,
  isOpen,
  onToggle,
  data,
  onChange,
}: {
  section: SurveySection;
  isOpen: boolean;
  onToggle: () => void;
  data: SurveyData;
  onChange: (next: SurveyData) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-[13px] font-bold text-emet-ink">{section.title}</span>
        <ChevronDownIcon
          className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-slate-100 flex flex-col gap-4 bg-slate-50/40">
          {section.fields.map((field, i) => (
            <FieldRenderer
              key={i}
              field={field}
              data={data}
              onChange={onChange}
              subBlocks={section.subBlocks}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRenderer({
  field,
  data,
  onChange,
  subBlocks,
}: {
  field: SurveyField;
  data: SurveyData;
  onChange: (next: SurveyData) => void;
  subBlocks?: SurveySection['subBlocks'];
}) {
  if (field.kind === 'radio') {
    const current = (getSurveyValue(data, field.path) as string) ?? '';
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-emet-ink">{field.label}</label>
        <div className="flex flex-col gap-1">
          {field.options?.map(opt => (
            <label key={opt.value} className="inline-flex items-center gap-2 text-[13px] text-slate-700 min-h-[28px] cursor-pointer">
              <input
                type="radio"
                name={field.groupName}
                value={opt.value}
                checked={current === opt.value}
                onChange={() => onChange(setSurveyValue(data, field.path, opt.value))}
                className="accent-emet-blue w-4 h-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.kind === 'checkbox') {
    const current = (getSurveyValue(data, field.path) as string[] | undefined) ?? [];
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-emet-ink">{field.label}</label>
        <div className="flex flex-col gap-1">
          {field.options?.map(opt => {
            const checked = current.includes(opt.value);
            const sub = opt.controls ? subBlocks?.find(b => b.id === opt.controls) : undefined;
            return (
              <div key={opt.value}>
                <label className="inline-flex items-center gap-2 text-[13px] text-slate-700 min-h-[28px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(toggleArrayValue(data, field.path, opt.value))}
                    className="accent-emet-blue w-4 h-4"
                  />
                  {opt.label}
                </label>
                {checked && sub && (
                  <div className="ml-6 mt-2 mb-2 pl-3 border-l-2 border-emet-blue/30 flex flex-col gap-3">
                    {sub.fields.map((f, j) => (
                      <FieldRenderer key={j} field={f} data={data} onChange={onChange} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.kind === 'textarea') {
    const current = (getSurveyValue(data, field.path) as string) ?? '';
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-slate-700">{field.label}</label>
        <textarea
          value={current}
          rows={field.rows ?? 2}
          onChange={e => onChange(setSurveyValue(data, field.path, e.target.value))}
          className="w-full font-sans text-[13px] text-emet-ink bg-white border border-slate-200 rounded-[8px] px-3 py-2 outline-none focus:border-emet-blue focus:shadow-[0_0_0_3px_rgba(6,106,171,0.12)] transition-all resize-y leading-relaxed"
        />
      </div>
    );
  }

  return null;
}
