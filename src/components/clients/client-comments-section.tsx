'use client';

/**
 * КОМЕНТАРІ МЕНЕДЖЕРА — секція у розгорнутій картці клієнта.
 *
 * Layout:
 *  [textarea: Додати коментар…]              [Зберегти]
 *  Останній коментар (1 шт):
 *  • Автор · 04.06.26 14:32
 *    Текст                                              ✕
 *  [Показати всю історію (N-1)]   ← якщо є більше 1
 *
 * Після розгортання — список усіх (включно з показаним останнім — починаючи знов з нього).
 */

import { useState } from 'react';
import { ChevronDown, MessageSquare, X as XIcon, Loader2 } from 'lucide-react';
import { useClientComments, addClientComment, deleteClientComment } from '@/lib/use-client-comments';
import type { ClientComment } from '@/lib/client-comments/types';

const MAX_LENGTH = 2000;

interface Props {
  clientId1c: string;
}

export function ClientCommentsSection({ clientId1c }: Props) {
  const { comments, loading } = useClientComments(clientId1c);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const latest = comments[0] ?? null;
  const rest = comments.slice(1);

  async function handleSave() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await addClientComment(clientId1c, text);
      setDraft('');
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: ClientComment) {
    if (!confirm('Видалити цей коментар?')) return;
    try {
      await deleteClientComment(c.id, clientId1c);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка видалення');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <MessageSquare className="h-3.5 w-3.5 text-emet-blue shrink-0" />
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-emet-ink">
          Коментарі менеджера
          {comments.length > 0 && (
            <span className="text-muted-foreground font-semibold ml-1.5">· {comments.length}</span>
          )}
        </h3>
      </div>

      {/* Поле нового коментаря */}
      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Додати коментар про клієнта…"
          rows={2}
          className="w-full px-3 py-2 text-[12px] rounded-xl bg-white/60 border border-slate-200 focus:border-emet-blue focus:ring-2 focus:ring-emet-blue/20 focus:outline-none resize-none placeholder:text-slate-400"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {draft.length > 0 && `${draft.length} / ${MAX_LENGTH}`}
            {saveErr && <span className="text-rose-600 ml-2">· {saveErr}</span>}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.trim() || saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emet-blue text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Зберегти
          </button>
        </div>
      </div>

      {/* Контент: loading / empty / latest */}
      {loading && comments.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">Завантажуємо коментарі…</div>
      ) : comments.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">Коментарів ще нема</div>
      ) : (
        <>
          <CommentItem comment={latest!} onDelete={handleDelete} />

          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(s => !s)}
              className="inline-flex items-center gap-1.5 mt-1 px-3.5 py-1.5 rounded-full bg-emet-blue/8 hover:bg-emet-blue/15 border border-emet-blue/15 text-emet-blue text-[11px] font-bold transition-all hover:-translate-y-px"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Згорнути історію' : `Показати всю історію (${rest.length})`}
            </button>
          )}

          {expanded && rest.length > 0 && (
            <ol className="space-y-2 mt-2">
              {rest.map(c => (
                <li key={c.id}>
                  <CommentItem comment={c} onDelete={handleDelete} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function CommentItem({ comment, onDelete }: { comment: ClientComment; onDelete: (c: ClientComment) => void }) {
  return (
    <div className="group relative rounded-xl bg-white/55 border border-slate-200/70 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[11px] font-bold text-emet-ink truncate">{comment.authorName}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {formatDateTime(comment.createdAt)}
        </span>
      </div>
      <p className="text-[12px] text-slate-700 whitespace-pre-wrap leading-relaxed">{comment.comment}</p>
      {comment.isMine && (
        <button
          type="button"
          onClick={() => onDelete(comment)}
          title="Видалити свій коментар"
          aria-label="Видалити свій коментар"
          className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}
