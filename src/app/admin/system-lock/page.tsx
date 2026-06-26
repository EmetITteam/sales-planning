'use client';

/**
 * /admin/system-lock — admin вмикає/вимикає глобальний kill-switch системи.
 *
 * Доступ: тільки role='admin' (itd@emet.in.ua). Інші → редірект на /.
 *
 * При locked=true:
 *   - менеджери НЕ можуть залогінитись (login 503)
 *   - активні сесії менеджерів падають на наступному API call (503 → редирект на /system-locked)
 *   - admin може все включно з цим toggle
 *
 * Створено 2026-06-26.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert, Lock, Unlock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface SystemLockState {
  locked: boolean;
  reason: string | null;
  locked_at: string | null;
  locked_by: string | null;
}

export default function SystemLockPage() {
  const router = useRouter();
  const { user } = useAppStore();

  const [state, setState] = useState<SystemLockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  const [showConfirm, setShowConfirm] = useState<'lock' | 'unlock' | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/');
    }
  }, [user, router]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    fetch('/api/admin/system-lock', { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: SystemLockState | { error: string }) => {
        if ('error' in s) throw new Error(s.error);
        setState(s);
        setReasonDraft(s.reason || '');
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [user]);

  const toggle = async (newLocked: boolean) => {
    setSubmitting(true);
    setError(null);
    setSavedMsg(null);
    try {
      const r = await fetch('/api/admin/system-lock', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locked: newLocked,
          reason: newLocked ? (reasonDraft.trim() || null) : null,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setState(body as SystemLockState);
      setShowConfirm(null);
      setSavedMsg(newLocked ? '🔒 Систему заблоковано' : '🔓 Систему розблоковано');
      setTimeout(() => setSavedMsg(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-3xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Адмін-панель
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-700 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Глобальний kill-switch</h1>
            <p className="text-[12px] text-muted-foreground">
              Закрити доступ до всієї системи у форс-мажорі (витік даних, атака, обслуговування)
            </p>
          </div>
        </div>

        {/* Як працює */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-[13px] font-bold">Як працює</h2>
          <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Поки <strong>заблоковано</strong> — менеджери НЕ можуть зайти у систему.</li>
            <li>Активні сесії менеджерів автоматично падають при наступному запиті — їх перекидає на сторінку «Система на обслуговуванні».</li>
            <li><strong>Адмін (itd@emet.in.ua) завжди має доступ</strong> — у тебе залишається можливість зайти і розблокувати.</li>
            <li>Зміна стану діє <strong>миттєво</strong> (5-секундний кеш у бекенді).</li>
          </ul>
        </div>

        {loading && (
          <div className="glass-card p-5 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантажую стан…
          </div>
        )}

        {error && (
          <div className="glass-card p-4 border-l-4 border-rose-500 flex items-start gap-2.5 text-[13px]">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold text-rose-700">Помилка</p>
              <p className="text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {state && !loading && (
          <>
            {/* Current state */}
            <div className={`glass-card p-5 border-l-4 ${state.locked ? 'border-rose-500' : 'border-emerald-500'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${state.locked ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {state.locked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <p className={`text-[15px] font-bold ${state.locked ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {state.locked ? 'Система заблокована' : 'Система працює нормально'}
                  </p>
                  {state.locked && (
                    <div className="mt-1.5 space-y-1">
                      {state.reason && (
                        <p className="text-[12px]">
                          <span className="text-muted-foreground">Причина:</span> {state.reason}
                        </p>
                      )}
                      {state.locked_at && (
                        <p className="text-[11px] text-muted-foreground">
                          Заблоковано: {new Date(state.locked_at).toLocaleString('uk-UA')}
                          {state.locked_by ? ` · ${state.locked_by}` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Reason input (тільки коли збираємось блокувати) */}
            {!state.locked && (
              <div className="glass-card p-5 space-y-3">
                <label className="block">
                  <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Причина блокування (необов'язково)</span>
                  <input
                    type="text"
                    value={reasonDraft}
                    onChange={e => setReasonDraft(e.target.value)}
                    maxLength={500}
                    placeholder="Наприклад: технічне обслуговування, інцидент безпеки..."
                    className="mt-2 w-full h-10 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe] focus:border-emet-blue/40 focus:outline-none"
                  />
                  <span className="text-[11px] text-muted-foreground mt-1.5 block">
                    Показується менеджерам на сторінці «Система на обслуговуванні».
                  </span>
                </label>
              </div>
            )}

            {/* Action button */}
            <div className="flex flex-wrap gap-3">
              {state.locked ? (
                <button
                  type="button"
                  onClick={() => setShowConfirm('unlock')}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[14px] font-bold shadow-lg shadow-emerald-500/20 hover:shadow-xl active:translate-y-px transition-all disabled:opacity-50"
                >
                  <Unlock className="h-4 w-4" />
                  Розблокувати систему
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirm('lock')}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 text-white text-[14px] font-bold shadow-lg shadow-rose-500/20 hover:shadow-xl active:translate-y-px transition-all disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  Заблокувати систему
                </button>
              )}

              {savedMsg && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[13px] font-medium text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  {savedMsg}
                </span>
              )}
            </div>
          </>
        )}

        {/* Confirm dialog */}
        {showConfirm && state && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="glass-card p-6 max-w-md w-full space-y-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${showConfirm === 'lock' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {showConfirm === 'lock' ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-[15px] font-bold">
                    {showConfirm === 'lock' ? 'Заблокувати систему?' : 'Розблокувати систему?'}
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {showConfirm === 'lock'
                      ? 'Всі менеджери будуть відключені на наступному запиті. Ти зможеш зайти у систему щоб розблокувати.'
                      : 'Менеджери знов зможуть заходити у систему.'}
                  </p>
                  {showConfirm === 'lock' && reasonDraft.trim() && (
                    <p className="text-[12px] mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                      <span className="font-semibold">Причина:</span> {reasonDraft}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowConfirm(null)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => toggle(showConfirm === 'lock')}
                  disabled={submitting}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white shadow-md transition-all disabled:opacity-50 ${
                    showConfirm === 'lock'
                      ? 'bg-rose-700 hover:bg-rose-800'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {showConfirm === 'lock' ? 'Так, заблокувати' : 'Так, розблокувати'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
