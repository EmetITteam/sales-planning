'use client';

/**
 * /admin/strategic-targets — форма вводу річних і місячних таргетів KPI
 *
 * Admin only. Доступ тільки для itd@emet.in.ua.
 *
 * Логіка:
 *  - Вибираєш рік (селектор) → 11 брендів × 2-3 канали таблично
 *  - Для кожної комбінації (бренд × канал) — форма з полями річних + місячних цілей
 *  - Плюс окремий блок ELLANSE-only з навчаннями
 *  - Save → upsert у strategic_targets (unique index year+brand+channel)
 *
 * Створено 2026-07-02 (Stage 1.5 Strategic KPI).
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import {
  STRATEGIC_BRANDS,
  STRATEGIC_CHANNELS,
  CHANNEL_LABEL,
  ELLANSE_BRAND,
  isChannelActive,
  type StrategicBrand,
  type StrategicChannel,
} from '@/lib/strategic-kpi/brands';
import {
  ArrowLeft,
  Target,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Building2,
  PhoneCall,
  Truck,
} from 'lucide-react';

interface TargetRow {
  year: number;
  brand: string;
  channel: string;
  unique_clients_annual: number | null;
  avg_check_annual: number | null;
  buyers_monthly: number | null;
  avg_qty_per_client: number | null;
  new_trained_annual: number | null;
  trainings_annual: number | null;
  trainings_repeat: number | null;
  conversion_repeat_pct: number | null;
  retention_monthly: number | null;
  updated_at?: string;
  updated_by?: string;
}

type Draft = Omit<TargetRow, 'updated_at' | 'updated_by'>;

const CHANNEL_ICON: Record<StrategicChannel, React.ComponentType<{ className?: string }>> = {
  representatives: Building2,
  call_center: PhoneCall,
  distributors: Truck,
};

function emptyDraft(year: number, brand: StrategicBrand, channel: StrategicChannel): Draft {
  return {
    year,
    brand,
    channel,
    unique_clients_annual: null,
    avg_check_annual: null,
    buyers_monthly: null,
    avg_qty_per_client: null,
    new_trained_annual: null,
    trainings_annual: null,
    trainings_repeat: null,
    conversion_repeat_pct: null,
    retention_monthly: null,
  };
}

export default function StrategicTargetsPage() {
  const router = useRouter();
  const { user } = useAppStore();

  const [year, setYear] = useState(new Date().getFullYear());
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<StrategicBrand>('Vitaran');

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/strategic-targets?year=${year}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: { targets?: TargetRow[]; error?: string }) => {
        if (s.error) throw new Error(s.error);
        setTargets(s.targets ?? []);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    load();
  }, [user, load]);

  const targetMap = useMemo(() => {
    const map = new Map<string, TargetRow>();
    for (const t of targets) {
      map.set(`${t.brand}|${t.channel}`, t);
    }
    return map;
  }, [targets]);

  const getDraft = (brand: StrategicBrand, channel: StrategicChannel): Draft => {
    const existing = targetMap.get(`${brand}|${channel}`);
    if (existing) return existing;
    return emptyDraft(year, brand, channel);
  };

  const [dirty, setDirty] = useState<Record<string, Draft>>({});

  const updateField = (brand: StrategicBrand, channel: StrategicChannel, field: keyof Draft, value: string) => {
    const key = `${brand}|${channel}`;
    const current = dirty[key] ?? getDraft(brand, channel);
    const num = value === '' ? null : parseFloat(value);
    setDirty({
      ...dirty,
      [key]: { ...current, [field]: num },
    });
    setSavedMsg(null);
  };

  const save = async (brand: StrategicBrand, channel: StrategicChannel) => {
    const key = `${brand}|${channel}`;
    const payload = dirty[key] ?? getDraft(brand, channel);
    setSavingKey(key);
    setError(null);
    try {
      const r = await fetch('/api/admin/strategic-targets', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setSavedMsg(`✓ Збережено ${brand} · ${CHANNEL_LABEL[channel]}`);
      // Reload щоб отримати оновлені updated_at/updated_by
      load();
      // Прибираємо draft
      const nextDirty = { ...dirty };
      delete nextDirty[key];
      setDirty(nextDirty);
      setTimeout(() => setSavedMsg(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-6xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Адмін-панель
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white flex items-center justify-center shadow-lg shadow-emet-blue/20">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Стратегічні таргети</h1>
            <p className="text-[12px] text-muted-foreground">
              Річні та місячні цілі KPI по брендах × канал. Використовуються у /admin/strategic-kpi.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="glass-card p-4 flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Рік</label>
            <select
              value={year}
              onChange={e => setYear(parseInt(e.target.value, 10))}
              className="h-9 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe] font-semibold"
            >
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2025}>2025</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Бренд</label>
            <div className="flex flex-wrap gap-1.5">
              {STRATEGIC_BRANDS.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBrand(b)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    b === selectedBrand
                      ? 'bg-emet-blue text-white shadow-lg shadow-emet-blue/20'
                      : 'bg-[#f4f7fb] text-muted-foreground hover:bg-[#e8ebf4]'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
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

        {loading && (
          <div className="glass-card p-6 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантажую таргети…
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {STRATEGIC_CHANNELS.filter(ch => isChannelActive(selectedBrand, ch)).map(channel => {
              const Icon = CHANNEL_ICON[channel];
              const key = `${selectedBrand}|${channel}`;
              const draft = dirty[key] ?? getDraft(selectedBrand, channel);
              const existing = targetMap.get(key);
              const isDirty = !!dirty[key];

              return (
                <div key={channel} className="glass-card p-5 space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-[#e2e7ef]">
                    <div className="w-9 h-9 rounded-xl bg-emet-50 flex items-center justify-center text-emet-blue">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold">{selectedBrand} · {CHANNEL_LABEL[channel]}</h3>
                      {existing?.updated_at ? (
                        <p className="text-[11px] text-muted-foreground">
                          Оновлено {new Date(existing.updated_at).toLocaleString('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {existing.updated_by ? ` · ${existing.updated_by}` : ''}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Ще не заповнено</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => save(selectedBrand, channel)}
                      disabled={!isDirty || savingKey === key}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emet-blue text-white text-[12px] font-bold hover:bg-emet-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Зберегти
                    </button>
                  </div>

                  {/* Річні цілі */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Річні цілі</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <NumField
                        label="Унікальні користувачі за рік, чел"
                        value={draft.unique_clients_annual}
                        onChange={v => updateField(selectedBrand, channel, 'unique_clients_annual', v)}
                      />
                      <NumField
                        label="Середній чек за рік, $"
                        value={draft.avg_check_annual}
                        onChange={v => updateField(selectedBrand, channel, 'avg_check_annual', v)}
                        step="0.01"
                      />
                    </div>
                  </div>

                  {/* Місячні цілі */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Місячні цілі</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <NumField
                        label="Купують у місяць, чел"
                        value={draft.buyers_monthly}
                        onChange={v => updateField(selectedBrand, channel, 'buyers_monthly', v)}
                      />
                      <NumField
                        label="ср/уп на 1 клієнта, шт"
                        value={draft.avg_qty_per_client}
                        onChange={v => updateField(selectedBrand, channel, 'avg_qty_per_client', v)}
                        step="0.1"
                      />
                    </div>
                  </div>

                  {/* ELLANSE-only: навчання */}
                  {selectedBrand === ELLANSE_BRAND && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <GraduationCap className="h-3 w-3" />
                        Навчання (тільки ELLANSE)
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <NumField
                          label="Нових обучених у рік, чел"
                          value={draft.new_trained_annual}
                          onChange={v => updateField(selectedBrand, channel, 'new_trained_annual', v)}
                        />
                        <NumField
                          label="Провести навчань у рік, шт"
                          value={draft.trainings_annual}
                          onChange={v => updateField(selectedBrand, channel, 'trainings_annual', v)}
                        />
                        <NumField
                          label="Повторних навчань, шт"
                          value={draft.trainings_repeat}
                          onChange={v => updateField(selectedBrand, channel, 'trainings_repeat', v)}
                        />
                        <NumField
                          label="Конверсія обучених → повторні, %"
                          value={draft.conversion_repeat_pct}
                          onChange={v => updateField(selectedBrand, channel, 'conversion_repeat_pct', v)}
                          step="0.1"
                        />
                        <NumField
                          label="Утримання покупаючих у міс., чел"
                          value={draft.retention_monthly}
                          onChange={v => updateField(selectedBrand, channel, 'retention_monthly', v)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

interface NumFieldProps {
  label: string;
  value: number | null;
  onChange: (v: string) => void;
  step?: string;
}

function NumField({ label, value, onChange, step = '1' }: NumFieldProps) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted-foreground mb-1.5">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        className="w-full h-10 px-3 text-[14px] rounded-xl border border-[#e8ebf4] bg-white font-mono tabular-nums text-right focus:border-emet-blue/40 focus:outline-none"
      />
    </label>
  );
}
