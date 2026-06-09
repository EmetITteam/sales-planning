'use client';

/**
 * ClaimDetailView — деталі однієї претензії + чат з мед-відділом.
 *
 * Дві SWR-зони:
 *  - claim: deтal pull з `/api/claims/[id]` (один раз + refresh on focus)
 *  - comments: pull з `/api/claims/[id]/comments` (polling 15с поки сторінка
 *    відкрита — щоб менеджер бачив відповіді мед-відділу без F5)
 *
 * UI:
 *  - Header (back-link, статус, ID)
 *  - Інфо-картка (продукт, LOT, тип, дата)
 *  - Деталі (текст details — те що серіалізували у submit)
 *  - Чат (timeline-коментарі у месенджер-стилі)
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  Paperclip,
  Send,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { STATUS_LABELS, type ClaimStatus, CLAIM_TYPES, PRODUCTS } from '@/lib/claims/constants';
import type { ClaimDetail, ClaimComment } from '@/lib/claims/types';

const MAX_TOTAL_SIZE_MB = 4; // Vercel body-limit safe
const MAX_FILES = 5;

const HEADERS_JSON = { 'Content-Type': 'application/json' };

const STATUS_COLORS: Record<ClaimStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

interface Props {
  claimId: number;
}

export function ClaimDetailView({ claimId }: Props) {
  // === Detail ===
  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
  } = useSWR<{ claim: ClaimDetail }>(
    `claim-${claimId}`,
    async () => {
      const r = await fetch(`/api/claims/${claimId}`, {
        credentials: 'same-origin',
        headers: HEADERS_JSON,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    { revalidateOnFocus: true },
  );

  // === Comments — polling 15с для real-time-feel ===
  const {
    data: commentsData,
    mutate: mutateComments,
  } = useSWR<{ comments: ClaimComment[] }>(
    `claim-${claimId}-comments`,
    async () => {
      const r = await fetch(`/api/claims/${claimId}/comments`, {
        credentials: 'same-origin',
        headers: HEADERS_JSON,
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json();
    },
    {
      revalidateOnFocus: true,
      refreshInterval: 15_000, // 15с — мед-відділ відповів → менеджер бачить без F5
      dedupingInterval: 5_000,
    },
  );

  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Завантажую рекламацію…
      </div>
    );
  }

  if (detailError) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
        <div className="font-semibold mb-1">Не вдалось завантажити</div>
        <div className="text-[12px]">{(detailError as Error).message}</div>
        <Link href="/claims" className="text-[12px] underline mt-2 inline-block">
          ← До списку
        </Link>
      </div>
    );
  }

  const claim = detailData?.claim;
  if (!claim) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
        Рекламацію не знайдено
      </div>
    );
  }

  const comments = commentsData?.comments ?? [];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Link
        href="/claims"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-emet-blue transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        До списку
      </Link>

      {/* Title */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[12px] font-mono font-bold text-muted-foreground">
              #{claim.id}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.6px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[claim.status]}`}
            >
              {STATUS_LABELS[claim.status]}
            </span>
            <span className="text-[11px] text-muted-foreground">{claim.date}</span>
          </div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-emet-ink leading-tight">
            {claim.client}
          </h1>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white border border-[#e2e7ef] rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 shadow-sm">
        <InfoCell label="Препарат" value={claim.product ? (PRODUCTS as Record<string, string>)[claim.product] ?? claim.product : '—'} />
        <InfoCell label="LOT" value={claim.lot ?? '—'} />
        <InfoCell label="Тип скарги" value={claim.claimType ?? '—'} />
        <InfoCell label="№ реалізації" value={claim.invoice && claim.invoice !== '-' ? claim.invoice : '—'} />
      </div>

      {/* Details text */}
      {claim.details && (
        <div className="bg-white border border-[#e2e7ef] rounded-xl p-4 shadow-sm">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.7px] text-slate-600 mb-2">
            Деталі
          </h3>
          <div className="text-[13px] text-emet-ink whitespace-pre-wrap leading-relaxed">
            {claim.details}
          </div>
        </div>
      )}

      {/* Chat */}
      <ClaimChat
        claimId={claimId}
        comments={comments}
        onSent={() => mutateComments()}
      />
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.6px] text-slate-500 mb-0.5">
        {label}
      </div>
      <div className="text-[13px] font-semibold text-emet-ink truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

interface ChatProps {
  claimId: number;
  comments: ClaimComment[];
  onSent: () => void;
}

function ClaimChat({ claimId, comments, onSent }: ChatProps) {
  const user = useAppStore(s => s.user);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalFileSize = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);
  const filesOverLimit = totalFileSize > MAX_TOTAL_SIZE_MB * 1024 * 1024;

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const incoming = Array.from(newFiles);
    setFiles(prev => [...prev, ...incoming].slice(0, MAX_FILES));
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Auto-scroll до низу при появі нових коментарів.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    // Можна надсилати або з текстом, або тільки з файлами, або обидва.
    // Заборонено лиш порожнє повідомлення без файлів.
    if (!trimmed && files.length === 0) return;
    if (sending || filesOverLimit) return;
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('text', trimmed);
      for (const f of files) fd.append('files', f, f.name);

      const r = await fetch(`/api/claims/${claimId}/comments`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok || body.error) {
        setError(body.error ?? `HTTP ${r.status}`);
        return;
      }
      setText('');
      setFiles([]);
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter надсилає, Shift+Enter — newline. Як у месенджерах.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-white border border-[#e2e7ef] rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100">
        <h3 className="text-[13px] font-bold text-emet-ink">
          Чат з мед-відділом
          {comments.length > 0 && (
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">
              · {comments.length} {comments.length === 1 ? 'повідомлення' : 'повідомлень'}
            </span>
          )}
        </h3>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-[200px] max-h-[480px] overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/50"
      >
        {comments.length === 0 ? (
          <div className="text-center py-8 text-[13px] text-muted-foreground">
            Поки що немає повідомлень. Напишіть першим — мед-відділ отримає сповіщення.
          </div>
        ) : (
          comments.map(c => {
            const isMedDept = c.authorType === 'bitrix';
            const isManager = c.authorType === 'manager';
            // Свої повідомлення (саме цього менеджера) — справа.
            // Чужі менеджерські (рідко, але можливо коли admin/director дивиться) — зліва.
            const isMine = isManager && c.author.trim() === (user?.fullName ?? '').trim();
            const authorLabel = isMedDept
              ? `Мед-відділ · ${c.author}`
              : isMine
                ? 'Ви'
                : `Менеджер · ${c.author}`;
            return (
              <div
                key={c.id}
                className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isMedDept
                      ? 'bg-emerald-100 text-emerald-700'
                      : isMine
                        ? 'bg-emet-blue text-white'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                  title={isMedDept ? 'Мед-відділ' : isMine ? 'Ви' : 'Інший менеджер'}
                >
                  {isMedDept ? (
                    <Stethoscope className="w-3.5 h-3.5" />
                  ) : (
                    <User className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className={`flex-1 max-w-[80%] ${isMine ? 'text-right' : ''}`}>
                  <div className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-2 px-1">
                    <span
                      className={`font-semibold ${
                        isMedDept ? 'text-emerald-700' : isMine ? 'text-emet-blue' : ''
                      }`}
                    >
                      {authorLabel}
                    </span>
                    <span className="text-muted-foreground/70">
                      {formatChatTime(c.createdAt)}
                    </span>
                  </div>
                  <div
                    className={`inline-block text-left px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed ${
                      isMine
                        ? 'bg-emet-blue text-white rounded-tr-sm'
                        : isMedDept
                          ? 'bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tl-sm'
                          : 'bg-slate-100 border border-slate-200 rounded-tl-sm'
                    }`}
                    dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(c.text, isManager) }}
                  />
                  {/* Прикріплені файли — Sprint 2B.B+. Грід картинок + посилання
                      на інші типи. Клік → відкриває у новій вкладці Bitrix. */}
                  {c.attachments && c.attachments.length > 0 && (
                    <div className={`mt-1.5 flex flex-wrap gap-1.5 ${isMine ? 'justify-end' : ''}`}>
                      {c.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={att.name}
                          className="block group"
                        >
                          {att.kind === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={att.url}
                              alt={att.name}
                              loading="lazy"
                              className="w-20 h-20 rounded-lg border border-slate-200 object-cover group-hover:opacity-80 transition-opacity"
                            />
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11.5px] text-slate-700 hover:border-emet-blue hover:text-emet-blue transition-colors">
                              <Paperclip className="w-3 h-3" />
                              <span className="font-medium truncate max-w-[140px]">
                                {att.name}
                              </span>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 px-3 py-2.5 bg-white space-y-2">
        {error && (
          <div className="text-[12px] text-rose-700 px-1">{error}</div>
        )}

        {/* Preview прикріплених файлів — до 5 шт, до 4MB сумарно */}
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
              >
                <div className="w-7 h-7 rounded bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                  {f.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] font-bold text-slate-500">
                      {f.type.startsWith('video/') ? 'VID' : 'FILE'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-medium truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {(f.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="w-6 h-6 rounded-md hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors shrink-0"
                  aria-label="Видалити"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {filesOverLimit && (
              <div className="text-[11px] text-rose-700 px-1">
                Сумарно {(totalFileSize / 1024 / 1024).toFixed(1)}MB &gt; ліміт {MAX_TOTAL_SIZE_MB}MB
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || files.length >= MAX_FILES}
            title="Прикріпити фото / відео"
            aria-label="Прикріпити файл"
            className="h-11 w-11 rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:border-emet-blue hover:text-emet-blue flex items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={e => {
              handleFiles(e.target.files);
              // reset так щоб повторне обрання того ж файла теж тригерило change
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              files.length > 0
                ? 'Додайте коментар або просто надішліть файли…'
                : 'Напишіть повідомлення… (Enter — надіслати, Shift+Enter — новий рядок)'
            }
            rows={2}
            disabled={sending}
            className="flex-1 px-3 py-2 rounded-[10px] border border-slate-200 bg-white/85 text-[13px] outline-none focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/30 transition-all resize-none min-h-[44px] max-h-[140px] disabled:opacity-50"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={(!text.trim() && files.length === 0) || sending || filesOverLimit}
            className="h-11 w-11 rounded-[10px] bg-emet-blue text-white flex items-center justify-center hover:bg-emet-blue-light active:translate-y-px transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            aria-label="Надіслати"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Очищаємо коментар від HTML і дублювання імені.
 *
 * Менеджерські коментарі у Bitrix зберігаються у форматі
 * «<b>Name</b> (Менеджер):<br>text». Імʼя автора ми вже показуємо у header
 * повідомлення — прибираємо префікс щоб не дублювати.
 *
 * `isManagerComment=true` — прибираємо префікс для ВСІХ менеджерських
 * коментарів (не лише своїх), бо у header вже є "Менеджер · {name}".
 *
 * Не дозволяємо script / iframe / on* — захист від XSS у Bitrix-content.
 */
function sanitizeCommentHtml(html: string, isManagerComment: boolean): string {
  if (!html) return '';
  let clean = html;
  if (isManagerComment) {
    // Прибираємо префікс "<b>...</b> (Менеджер):<br>" — він дублює автора.
    clean = clean.replace(/^<b>.*?<\/b>\s*\(Менеджер\):\s*<br\s*\/?>/i, '');
  }
  // Strip небезпечні теги
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  clean = clean.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  clean = clean.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  return clean;
}

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString('uk-UA', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
