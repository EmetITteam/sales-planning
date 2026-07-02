'use client';

/**
 * /admin/ellanse-seminars — факт семінарів Ellanse дистриб'юторів per місяць.
 *
 * Таблиця 12 місяців × 2 локації (Полтава + Чернівці).
 * Admin вводить факт вручну — по цій частині 1С даних немає.
 *
 * Admin only. Створено 2026-07-02.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { ELLANSE_DISTRIBUTOR_LOCATIONS, LOCATION_LABEL, type EllanseDistributorLocation } from '@/lib/strategic-kpi/brands';
import { ArrowLeft, GraduationCap, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface SeminarRow {
  id?: number;
  year: number;
  month: number;
  location: EllanseDistributorLocation;
  seminars_held: number;
  new_trained: number | null;
  notes: string | null;
  updated_at?: string;
  updated_by?: string;
}

type Draft = Omit<SeminarRow, 'id' | 'updated_at' | 'updated_by'>;

const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function emptyDraft(year: number, month: number, location: EllanseDistributorLocation): Draft {
  return { year, month, location, seminars_held: 0, new_trained: null, notes: null };
}

export default function EllanseSeminarsPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<SeminarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/ellanse-seminars?year=${year}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: { seminars?: SeminarRow[]; error?: string }) => {
        if (s.error) throw new Error(s.error);
        setRows(s.seminars ?? []);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [user, load]);

  const getRow = (month: number, location: EllanseDistributorLocation): Draft => {
    const key = `${month}|${location}`;
    if (dirty[key]) return dirty[key];
    const existing = rows.find(r => r.month === month && r.location === location);
    if (existing) return { ...existing };
    return emptyDraft(year, month, location);
  };

  const updateField = (month: number, location: EllanseDistributorLocation, field: 'seminars_held' | 'new_trained' | 'notes', value: string) => {
    const key = `${month}|${location}`;
    const current = dirty[key] ?? getRow(month, location);
    const val: number | string | null =
      field === 'notes' ? (value || null) :
      value === '' ? null : parseInt(value, 10);
    setDirty({ ...dirty, [key]: { ...current, [field]: val as never } });
    setSavedMsg(null);
  };

  const save = async (month: number, location: EllanseDistributorLocation) => {
    const key = `${month}|${location}`;
    const payload = dirty[key] ?? getRow(month, location);
    setSavingKey(key);
    setError(null);
    try {
      const r = await fetch('/api/admin/ellanse-seminars', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setSavedMsg(`✓ ${MONTHS_UA[month - 1]} · ${LOCATION_LABEL[location]}`);
      load();
      const nextDirty = { ...dirty };
      delete nextDirty[key];
      setDirty(nextDirty);
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  if (!user || user.role !== 'admin') return null;

  const totals = ELLANSE_DISTRIBUTOR_LOCATIONS.reduce<Record<string, { seminars: number; trained: number }>>(
    (acc, loc) => {
      let seminars = 0, trained = 0;
      for (let m = 1; m <= 12; m++) {
        const r = getRow(m, loc);
        seminars += r.seminars_held || 0;
        trained += r.new_trained || 0;
      }
      acc[loc] = { seminars, trained };
      return acc;
    },
    {},
  );

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-5xl mx-auto space-y-6">
        <Link
          href="/admin/strategic-targets"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Стратегічні таргети
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Ellanse семінари · факт</h1>
            <p className="text-[12px] text-muted-foreground">
              Дистриб&apos;ютори по місяцях: Полтава + Чернівці. Вводить admin вручну.
            </p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-4">
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Рік</span>
            <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
              className="h-9 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe] font-semibold">
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2025}>2025</option>
            </select>
          </label>
          <div className="flex-1" />
          <div className="text-[11px] text-muted-foreground">
            <p>Разом: <span className="font-mono font-bold">{totals.poltava.seminars + totals.chernivtsi.seminars}</span> семінарів,
              {' '}<span className="font-mono font-bold">{totals.poltava.trained + totals.chernivtsi.trained}</span> обучено</p>
          </div>
        </div>

        {error && (
          <div className="glass-card p-4 border-l-4 border-rose-500 flex items-start gap-2.5 text-[13px]">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold text-rose-700">Помилка</p>
              <p className="text-rose-700">{error}</p>
            </div>
          </div>
        )}
        {savedMsg && (
          <div className="glass-card p-3 border-l-4 border-emerald-500 flex items-center gap-2 text-[13px] text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {savedMsg}
          </div>
        )}

        {loading ? (
          <div className="glass-card p-6 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантажую…
          </div>
        ) : (
          <div className="space-y-3">
            {ELLANSE_DISTRIBUTOR_LOCATIONS.map(loc => (
              <div key={loc} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#e2e7ef]">
                  <h3 className="text-[14px] font-bold uppercase tracking-wider text-emet-blue">{LOCATION_LABEL[loc]}</h3>
                  <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
                    Разом: <strong>{totals[loc].seminars}</strong> семінарів · <strong>{totals[loc].trained}</strong> обучено
                  </div>
                </div>

                {/* Header */}
                <div className="grid grid-cols-[110px_110px_110px_1fr_44px] gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-2 border-b border-[#f0f2f8] items-center">
                  <span>Місяць</span>
                  <span className="text-right">Семінарів</span>
                  <span className="text-right">Обучено</span>
                  <span>Примітка</span>
                  <span />
                </div>
                {/* Rows */}
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const key = `${m}|${loc}`;
                  const r = getRow(m, loc);
                  const isDirty = !!dirty[key];
                  const existing = rows.find(x => x.month === m && x.location === loc);
                  return (
                    <div key={key} className="grid grid-cols-[110px_110px_110px_1fr_44px] gap-3 items-center py-2 text-[12.5px] border-b border-[#f0f2f8] last:border-b-0">
                      <span className="text-muted-foreground">{MONTHS_UA[m - 1]}</span>
                      <input
                        type="number" min="0"
                        value={r.seminars_held ?? ''}
                        onChange={e => updateField(m, loc, 'seminars_held', e.target.value)}
                        className="h-9 w-full px-2.5 text-[13px] rounded-lg border border-[#e8ebf4] bg-white font-mono tabular-nums text-right"
                      />
                      <input
                        type="number" min="0"
                        value={r.new_trained ?? ''}
                        placeholder="—"
                        onChange={e => updateField(m, loc, 'new_trained', e.target.value)}
                        className="h-9 w-full px-2.5 text-[13px] rounded-lg border border-[#e8ebf4] bg-white font-mono tabular-nums text-right"
                      />
                      <input
                        type="text"
                        value={r.notes ?? ''}
                        placeholder={existing?.updated_at ? `${existing.updated_by} · ${new Date(existing.updated_at).toLocaleDateString('uk-UA')}` : ''}
                        onChange={e => updateField(m, loc, 'notes', e.target.value)}
                        className="h-9 w-full px-2.5 text-[12px] rounded-lg border border-[#e8ebf4] bg-white"
                      />
                      <button type="button" onClick={() => save(m, loc)}
                        disabled={!isDirty || savingKey === key}
                        className="w-9 h-9 rounded-lg bg-emet-blue text-white flex items-center justify-center hover:bg-emet-blue/90 disabled:opacity-30 transition-all"
                        title="Зберегти рядок"
                      >
                        {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
