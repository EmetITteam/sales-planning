'use client';

/**
 * Draft page: B2B-метрики що audit рекомендував додати.
 *
 * Це PREVIEW для перегляду — користувачка дивиться чи такі метрики
 * корисні. Якщо «так» — інтегруємо у головний overview. Якщо «ні» —
 * видаляємо файл.
 *
 * НЕ замінює існуючий «Огляд компанії» — це просто draft на оцінку.
 *
 * Метрики:
 *  - Pipeline coverage (forecast + gap / plan)
 *  - NRR (Net Revenue Retention) — % факту від клієнтів що купували мин.міс.
 *  - AOV per brand
 *  - Stage-done ratio
 *  - Brand mix concentration (топ-3 share)
 *
 * Дані будуть тягтись з тих самих 1С actions + Supabase. Поки —
 * placeholder з пояснювальним текстом.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import Link from 'next/link';
import { ArrowLeft, FlaskConical, TrendingUp, Repeat, BarChart3, CheckCircle2, PieChart } from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  what: string;
  formula: string;
  why: string;
  example: string;
}

function PreviewMetricCard({ icon, iconBg, title, what, formula, why, example }: MetricCardProps) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} text-white flex items-center justify-center shadow-md shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold">{title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{what}</p>
        </div>
      </div>
      <div className="space-y-2 text-[12px] mt-3 pt-3 border-t border-white/40">
        <p>
          <span className="font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Формула:</span>
          <br />
          <code className="text-[11px] bg-white/40 px-2 py-0.5 rounded">{formula}</code>
        </p>
        <p>
          <span className="font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Навіщо:</span> {why}
        </p>
        <p>
          <span className="font-bold text-muted-foreground uppercase tracking-wider text-[9px]">Приклад:</span> {example}
        </p>
      </div>
    </div>
  );
}

export default function AnalyticsPreviewPage() {
  const router = useRouter();
  const user = useAppStore(s => s.user);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  if (!user || user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-6xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Назад до адмінки
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/15">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">B2B-метрики · draft на оцінку</h1>
            <p className="text-[12px] text-muted-foreground">
              5 додаткових KPI що audit рекомендував для дистрибутора косметики. Перегляньте — якщо корисно, інтегруємо в «Огляд компанії».
            </p>
          </div>
        </div>

        <div className="glass-card-soft p-4 text-[12px] text-amber-700 bg-amber-50/60">
          <strong>Це preview-сторінка.</strong> Реальні дані ще не підключені — поки що тільки опис кожної метрики:
          що рахує / навіщо / як виглядатиме. Якщо метрика OK — підключимо.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PreviewMetricCard
            icon={<TrendingUp className="h-5 w-5" />}
            iconBg="bg-gradient-to-br from-[#066aab] to-[#0880cc]"
            title="Pipeline Coverage"
            what="Скільки прогнозу + закриття розриву покриває залишок плану"
            formula="(Σ forecast + Σ gap_closure) / (plan − fact)"
            why="Forward-looking метрика #1 для дистрибутора. >100% = план буде закритий. <100% = ризик. Це найкраща єдина цифра яка прогнозує чи здамо місяць."
            example="План $1.5M, факт $822K. Лишилось $678K. Forecast $400K + gap $300K = $700K → 103% → план буде закритий"
          />

          <PreviewMetricCard
            icon={<Repeat className="h-5 w-5" />}
            iconBg="bg-gradient-to-br from-emerald-500 to-teal-500"
            title="Net Revenue Retention (NRR)"
            what="% факту що йде від клієнтів які купували минулого місяця"
            formula="fact_from_repeat_clients / total_fact × 100%"
            why="Здоров'я клієнтської бази. <70% = втрачаємо клієнтів. >90% = стабільність. Дозволяє побачити чи ми ростемо за рахунок повторних чи нових."
            example="З $822K факту, $650K — від клієнтів що купували минулого місяця → NRR=79%. Решта $172K — нові клієнти або реактивовані сплячі."
          />

          <PreviewMetricCard
            icon={<BarChart3 className="h-5 w-5" />}
            iconBg="bg-gradient-to-br from-violet-500 to-purple-500"
            title="AOV per brand"
            what="Середній чек на клієнта по кожному бренду"
            formula="brand_fact / unique_buyers_brand"
            why="Пояснює fact movements: впав факт через менше клієнтів (втрачаємо) або через менші чеки (зменшилась лояльність)?"
            example="Vitaran: $510K / 234 покупців = $2,180 AOV. Якщо минулого місяця було $2,500 → впала вірність бренду на 13%"
          />

          <PreviewMetricCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            iconBg="bg-gradient-to-br from-blue-500 to-indigo-500"
            title="Stage-done ratio (РМ)"
            what="% запланованих менеджером етапів (дзвінок/зустріч/навчання) що позначені як done"
            formula="rows_with_stageDone=true / total_planned_rows"
            why="Дисципліна РМ. Низький ratio = менеджери не закривають activities → план виконують випадково. Високий = організована робота."
            example="Менеджер запланував 45 дзвінків, 28 з 1С позначив done → 62%. Може бути сигналом що 17 дзвінків насправді не зроблено"
          />

          <PreviewMetricCard
            icon={<PieChart className="h-5 w-5" />}
            iconBg="bg-gradient-to-br from-amber-500 to-orange-500"
            title="Brand Mix Concentration"
            what="Частка топ-3 брендів у загальному факті"
            formula="(brand1.fact + brand2.fact + brand3.fact) / total_fact × 100%"
            why="Раннє попередження про залежність. Якщо топ-3 = 85% — ризик. Бажано <70% (різноманіття). Допомагає вирішувати які бренди розвивати."
            example="Vitaran 42% + Neuronox 25% + Ellanse 18% = 85% з топ-3 → завелика концентрація. План: підняти продаж Petaran і Neuramis"
          />

          <div className="glass-card-soft p-6 flex flex-col justify-center items-center text-center">
            <p className="text-[13px] font-bold mb-2">Що далі?</p>
            <p className="text-[11px] text-muted-foreground mb-4">
              Перегляньте 5 метрик зліва. Корисні? Які з них треба у «Огляд компанії»?
            </p>
            <p className="text-[11px] text-muted-foreground">
              Якщо потрібна додаткова метрика яка не у списку — додайте свою ідею у комент до коміту.
            </p>
          </div>
        </div>

        <div className="glass-card-soft p-4 text-[12px] text-muted-foreground">
          <strong>Технічна примітка:</strong> усі 5 метрик можливо реалізувати з наявних даних (Supabase + 1С Action 3/4/5).
          NRR і AOV — потребують додаткового запиту до 1С з фільтром по lastPurchaseDate (~2-3 години роботи).
          Pipeline Coverage і Stage-done — повністю з Supabase (~1 година).
          Brand Mix Concentration — обчислюється з тих самих даних що зараз показує donut «Бренди» (≤30 хвилин).
        </div>
      </main>
    </>
  );
}
