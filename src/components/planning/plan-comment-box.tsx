'use client';

/**
 * Коментар директора по продажах до плану менеджера (по бренду).
 * - Тред існуючих коментарів (бачать і менеджер, і директор).
 * - Для директора/адміна у режимі перегляду — кнопка + діалог з 3 діями:
 *   «Відправити + розфіналізувати», «Просто внести коментар», «Скасувати».
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MessageSquare, RotateCcw, Send, Check } from 'lucide-react';
import type { PlanComment } from '@/lib/use-plan-comments';

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi}`;
}

interface Props {
  managerLogin: string;
  periodId: number;
  month: string;
  segmentCode: string;
  segmentName: string;
  canComment: boolean;           // director/admin у режимі перегляду
  canResolve: boolean;           // сам менеджер на своєму плані — може «Виконано»
  attached: boolean;             // прикріплено впритул до картки (згорнутий бренд)
  comments: PlanComment[];
  onChanged: (didUnfinalize: boolean) => void;
}

export function PlanCommentBox({ managerLogin, periodId, month, segmentCode, segmentName, canComment, canResolve, attached, comments, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  if (comments.length === 0 && !canComment) return null;

  async function resolve(commentId: number) {
    setResolvingId(commentId);
    try {
      const r = await fetch('/api/planning/plan-comment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ commentId }),
      });
      if (r.ok) onChanged(false);
    } finally {
      setResolvingId(null);
    }
  }

  async function submit(unfinalize: boolean) {
    const body = text.trim();
    if (!body) { setErr('Порожній коментар'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/planning/plan-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ targetLogin: managerLogin, periodId, period: { month }, segmentCode, text: body, unfinalize }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || `Помилка ${r.status}`); return; }
      setText(''); setOpen(false);
      onChanged(unfinalize);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // attached — нижня частина ТІЄЇ Ж картки бренда (без верхнього скруглення,
  // впритул). Інакше (розгорнутий бренд) — окрема панель з невеликим відступом.
  const panelClass = attached
    ? '-mt-px rounded-t-none rounded-b-[20px] border border-t-0 border-white/70 shadow-[0_8px_32px_rgba(6,42,61,0.04)]'
    : 'mt-1.5 rounded-2xl border border-[rgba(6,42,61,0.10)]';

  return (
    <div className={`${panelClass} bg-white/45 backdrop-blur-md px-3.5 py-2`}>
      {/* Тред */}
      {comments.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2.5 text-[12px] rounded-xl bg-amber-500/[0.07] border border-amber-300/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-amber-800">{c.author_name || c.author_login}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{fmtWhen(c.created_at)}</span>
                  {c.action === 'comment_unfinalize' && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/12 border border-rose-300/50 text-rose-700">на переробку</span>
                  )}
                </div>
                <div className="text-foreground/90 whitespace-pre-wrap break-words">{c.text}</div>
              </div>
              {canResolve && (
                <button
                  onClick={() => resolve(c.id)}
                  disabled={resolvingId === c.id}
                  title="Позначити виконаним — коментар зникне, директор отримає сповіщення"
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/12 border border-emerald-300/50 text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  <Check className="h-3 w-3" /> Готово
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Кнопка додати (лише директор/адмін у перегляді) */}
      {canComment && (
        <button
          onClick={() => { setErr(null); setOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-amber-800 bg-amber-500/12 border border-amber-300/50 hover:bg-amber-500/20 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" /> {comments.length > 0 ? 'Додати коментар' : 'Написати коментар'}
        </button>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) setOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-[15px]">Коментар до плану · {segmentName}</DialogTitle>
          <p className="text-[12px] text-muted-foreground -mt-1">
            Коментар прилетить менеджеру у колокольчик. «Розфіналізувати» — відкриє цей бренд менеджеру на переробку.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={4}
            maxLength={2000}
            placeholder="Що не так з планом по цьому бренду…"
            className="w-full rounded-xl border border-[rgba(6,42,61,0.15)] bg-white/70 px-3 py-2 text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-emet-blue/30"
          />
          {err && <p className="text-[12px] text-rose-600">{err}</p>}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => submit(true)}
              disabled={busy || !text.trim()}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-rose-600 text-white font-semibold text-[13px] disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              <RotateCcw className="h-4 w-4" /> Відправити + розфіналізувати
            </button>
            <button
              onClick={() => submit(false)}
              disabled={busy || !text.trim()}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-emet-blue text-white font-semibold text-[13px] disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              <Send className="h-4 w-4" /> Просто внести коментар
            </button>
            <button
              onClick={() => { if (!busy) setOpen(false); }}
              disabled={busy}
              className="h-10 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              Скасувати
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
