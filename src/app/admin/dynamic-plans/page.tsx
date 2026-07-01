'use client';

/**
 * /admin/dynamic-plans — admin керує сегментами де plan=fact дзеркально.
 *
 * Юз-кейс: NEURONOX (обмежений залишок товарів) — план у 1С може стояти,
 * але щоб не показувати невиконання, дзеркалимо plan = fact автоматично.
 * По цих брендах менеджер НЕ планується по клієнтах (у формі ховаємо
 * блоки прогнозу + розриву, показуємо пояснювальну картку).
 *
 * Доступ: тільки role='admin' (itd@emet.in.ua).
 *
 * Створено 2026-07-01.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { SEGMENTS } from '@/lib/mock-data';
import { ArrowLeft, Sparkles, Plus, X, AlertCircle, CheckCircle2, Loader2, PowerOff, Trash2 } from 'lucide-react';

interface Rule {
  id: string;
  segment_code: string;
  enabled_from: string;
  enabled_to: string | null;
  strategy: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export default function DynamicPlansPage() {
  const router = useRouter();
  const { user } = useAppStore();

  const [rules, setRules] = useState<Rule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [draft, setDraft] = useState({
    segment_code: '',
    enabled_from: (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    })(),
    enabled_to: '',
    reason: '',
  });

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/dynamic-plans', { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: { rules?: Rule[]; error?: string }) => {
        if (s.error) throw new Error(s.error);
        setRules(s.rules ?? []);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    load();
  }, [user]);

  const create = async () => {
    setSubmitting(true);
    setError(null);
    setSavedMsg(null);
    try {
      const r = await fetch('/api/admin/dynamic-plans', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment_code: draft.segment_code,
          enabled_from: draft.enabled_from,
          enabled_to: draft.enabled_to || null,
          reason: draft.reason.trim() || null,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setSavedMsg('Правило створено');
      setShowCreate(false);
      setDraft(d => ({ ...d, segment_code: '', enabled_to: '', reason: '' }));
      load();
      setTimeout(() => setSavedMsg(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Деактивувати правило з завтра? Поточний місяць лишається дзеркальним.')) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/admin/dynamic-plans', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'deactivate' }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      load();
      setSavedMsg('Правило деактивовано');
      setTimeout(() => setSavedMsg(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const removeRule = async (id: string) => {
    if (!confirm('Повністю видалити правило? Дія незворотня. Історія за минулі місяці залишиться незмінною.')) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/dynamic-plans?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      load();
      setSavedMsg('Правило видалено');
      setTimeout(() => setSavedMsg(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || user.role !== 'admin') return null;

  const today = new Date().toISOString().slice(0, 10);
  const isActive = (r: Rule) => r.enabled_from <= today && (r.enabled_to === null || r.enabled_to >= today);

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-4xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Адмін-панель
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Динамічні плани</h1>
            <p className="text-[12px] text-muted-foreground">
              Сегменти для яких plan=fact дзеркально (виконання завжди 100%)
            </p>
          </div>
        </div>

        {/* Як працює */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-[13px] font-bold">Як працює</h2>
          <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Обираєш сегмент (бренд) і місяць з якого діє дзеркалення.</li>
            <li>З цього місяця у дашбордах Manager/RM/Director/Company Overview план = факт (виконання 100%, бейдж «Динамічний план»).</li>
            <li>У формі планування менеджер побачить пояснювальну картку — Прогноз і Закриття розриву не заповнює.</li>
            <li>Історія за попередні місяці НЕ змінюється (там лишаються реальні плани з 1С).</li>
            <li>«Деактивувати» — м&apos;яко закриває правило з завтра (поточний місяць лишається). «Видалити» — жорстко.</li>
          </ul>
        </div>

        {error && (
          <div className="glass-card p-4 border-l-4 border-rose-500 flex items-start gap-2.5 text-[13px]">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-rose-700">Помилка</p>
              <p className="text-rose-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {savedMsg && (
          <div className="glass-card p-3 border-l-4 border-emerald-500 flex items-center gap-2 text-[13px] text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {savedMsg}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Правила</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emet-blue text-white text-[13px] font-bold hover:bg-emet-blue/90 active:translate-y-px transition-all"
          >
            <Plus className="h-4 w-4" />
            Нове правило
          </button>
        </div>

        {loading && (
          <div className="glass-card p-5 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантажую…
          </div>
        )}

        {rules && rules.length === 0 && !loading && (
          <div className="glass-card p-8 text-center text-[13px] text-muted-foreground">
            Правил ще немає. Створи перше — наприклад для NEURONOX з 1 липня.
          </div>
        )}

        {rules && rules.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px_100px_1fr_160px] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-[#e2e7ef]">
              <span>Сегмент</span>
              <span>З</span>
              <span>До</span>
              <span>Статус</span>
              <span>Причина</span>
              <span className="text-right">Дії</span>
            </div>
            {rules.map(r => {
              const active = isActive(r);
              const seg = SEGMENTS.find(s => s.code === r.segment_code);
              return (
                <div key={r.id} className="grid grid-cols-[1fr_120px_120px_100px_1fr_160px] gap-3 px-4 py-3 items-center text-[13px] border-b border-[#f0f2f8] last:border-b-0">
                  <div>
                    <p className="font-bold">{seg?.name ?? r.segment_code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.created_by} · {new Date(r.created_at).toLocaleDateString('uk-UA')}
                    </p>
                  </div>
                  <span className="tabular-nums text-[12px]">{r.enabled_from}</span>
                  <span className="tabular-nums text-[12px]">{r.enabled_to ?? '∞'}</span>
                  <span>
                    {active ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/12 border border-emerald-300/50 text-emerald-700">
                        активне
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-500/12 border border-slate-300/50 text-slate-600">
                        неактивне
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] text-muted-foreground truncate">{r.reason || '—'}</span>
                  <div className="flex items-center justify-end gap-1.5">
                    {active && r.enabled_to === null && (
                      <button
                        onClick={() => deactivate(r.id)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        title="Закрити з завтра (поточний місяць лишається)"
                      >
                        <PowerOff className="h-3 w-3" /> Деактивувати
                      </button>
                    )}
                    <button
                      onClick={() => removeRule(r.id)}
                      disabled={submitting}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                      title="Видалити повністю"
                    >
                      <Trash2 className="h-3 w-3" /> Видалити
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="glass-card p-6 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold">Нове правило динамічного плану</h3>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Сегмент</span>
                <select
                  value={draft.segment_code}
                  onChange={e => setDraft(d => ({ ...d, segment_code: e.target.value }))}
                  className="mt-1.5 w-full h-10 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                >
                  <option value="">— обери сегмент —</option>
                  {SEGMENTS.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">З дати</span>
                  <input
                    type="date"
                    value={draft.enabled_from}
                    onChange={e => setDraft(d => ({ ...d, enabled_from: e.target.value }))}
                    className="mt-1.5 w-full h-10 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">До (опц.)</span>
                  <input
                    type="date"
                    value={draft.enabled_to}
                    min={draft.enabled_from}
                    onChange={e => setDraft(d => ({ ...d, enabled_to: e.target.value }))}
                    className="mt-1.5 w-full h-10 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Причина (опц.)</span>
                <input
                  type="text"
                  value={draft.reason}
                  onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))}
                  maxLength={500}
                  placeholder="Наприклад: обмежений залишок NEURONOX"
                  className="mt-1.5 w-full h-10 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                />
              </label>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={submitting || !draft.segment_code || !draft.enabled_from}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white bg-emet-blue hover:bg-emet-blue/90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Створити
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
