'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import Link from 'next/link';
import { Shield, ShieldAlert, Lock, Settings2, ArrowLeft, Building2, RefreshCw, Calendar, CheckCircle2, XCircle, AlertTriangle, Sparkles, Target, BarChart3, GraduationCap } from 'lucide-react';

/**
 * Адмін-панель (заглушка під Етап 1 Пакету А).
 *
 * Поки що сторінка повідомляє що тут будуть інструменти керування:
 *   - Блокування/розблокування планування (Етап 3)
 *   - Розфіналізація планів менеджерів (Етап 2)
 *   - Налаштування window-lock (Етап 3)
 *
 * Доступна тільки `role='admin'`. Інші ролі → редірект на /.
 */
export default function AdminPage() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/');
    }
  }, [user, router]);

  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-5xl mx-auto space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> На дашборд
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#991b1b] to-[#dc2626] text-white flex items-center justify-center shadow-lg shadow-rose-500/15">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Адмін-панель</h1>
            <p className="text-[12px] text-muted-foreground">Керування плануванням і доступом</p>
          </div>
        </div>

        <div className="space-y-7">
          {/* Дашборди — read-only перегляд (акцент, найчастіше відкривають) */}
          <AdminSection title="Дашборди · перегляд" accent>
            <AdminCard
              href="/admin/company-overview"
              icon={<Building2 className="h-4 w-4 text-emet-blue" />}
              title="Огляд компанії"
              description="Уся компанія — план/факт по 13 підрозділах (включно з Колл-центр, Лазерхауз, Адасса, Чугуй, Хайленко). Heatmap бренд×підрозділ + donut-діаграми. Read-only."
              ready
            />
            <AdminCard
              href="/admin/strategic-kpi"
              icon={<BarChart3 className="h-4 w-4 text-emet-blue" />}
              title="Стратегічний KPI-дашборд"
              description="Виконання цілей по брендах: унікальні клієнти, купують у міс., середній чек, ср/уп. На даних sales таблиці (265K рядків з 2022+). Живі дані з Supabase."
              ready
            />
          </AdminSection>

          {/* Планування */}
          <AdminSection title="Планування">
            <AdminCard
              href="/admin/planning-locks"
              icon={<Lock className="h-4 w-4 text-amber-700" />}
              title="Блокування планування"
              description="Графік (скільки перших днів місяця відкрито для редагування, за замовч.: 5) + персональні блокування/дозволи менеджерам."
              ready
            />
            <AdminCard
              href="/admin/unfinalize-permissions"
              icon={<Settings2 className="h-4 w-4 text-rose-600" />}
              title="Розфіналізація планів"
              description="Кому дозволено натискати «Розфіналізувати» у формі планування менеджера. Admin завжди має дозвіл. Іншим юзерам — за галочкою (наприклад, асистент директора)."
              ready
            />
            <AdminCard
              href="/admin/stage-edit-permissions"
              icon={<Settings2 className="h-4 w-4 text-amber-700" />}
              title="Редагування етапу після фіналу"
              description="Per-manager дозвіл міняти поле «Етап» (Дзвінок/Зустріч/Навчання) у формі планування навіть після фіналізації. Суми лишаються заблокованими."
              ready
            />
            <AdminCard
              href="/admin/dynamic-plans"
              icon={<Sparkles className="h-4 w-4 text-emerald-600" />}
              title="Динамічні плани"
              description="Сегменти для яких plan=fact дзеркально (виконання завжди 100%). Юз-кейс: NEURONOX — обмежений залишок товарів. По цих брендах менеджер не планується по клієнтах."
              ready
            />
          </AdminSection>

          {/* Доступи */}
          <AdminSection title="Доступи">
            <AdminCard
              href="/admin/company-overview-permissions"
              icon={<Building2 className="h-4 w-4 text-emet-blue" />}
              title="Доступ до «Огляду компанії»"
              description="Кому показувати toggle «Дашборд / Огляд компанії» на головній сторінці. Admin завжди має доступ. Інші юзери — за галочкою."
              ready
            />
            <AdminCard
              href="/region-access"
              icon={<Building2 className="h-4 w-4 text-blue-600" />}
              title="Тимчасовий доступ до регіону"
              description="Надати менеджеру перегляд усього регіону (планування) на час планёрки: регіон → менеджер → період. Read-only. Директор/асистент керують цим зі свого меню акаунта."
              ready
            />
          </AdminSection>

          {/* Стратегія — дані/таргети (дашборди — у верхній секції) */}
          <AdminSection title="Стратегія · дані">
            <AdminCard
              href="/admin/strategic-targets"
              icon={<Target className="h-4 w-4 text-emet-blue" />}
              title="Стратегічні таргети"
              description="Річні і місячні цілі KPI по 11 брендах × канал (Представництва / Колл-центр / Дистриб'ютори). Живлять дашборд /admin/strategic-kpi."
              ready
            />
            <AdminCard
              href="/admin/ellanse-seminars"
              icon={<GraduationCap className="h-4 w-4 text-amber-600" />}
              title="Ellanse семінари · факт"
              description="Дистриб'ютори по місяцях: Полтава + Чернівці. Скільки семінарів фактично провели + опц. нових обучених. Вручну, бо у 1С даних немає."
              ready
            />
          </AdminSection>

          {/* Система · операції */}
          <AdminSection title="Система · операції">
            <AdminCard
              href="/admin/system-lock"
              icon={<ShieldAlert className="h-4 w-4 text-rose-700" />}
              title="Kill-switch системи"
              description="Глобальне блокування доступу для всіх крім admin. Для форс-мажорних випадків (інцидент безпеки, обслуговування). Менеджери відключаються миттєво."
              ready
            />
            <AdminCard
              href="/admin/sync-dlq"
              icon={<AlertTriangle className="h-4 w-4 text-rose-600" />}
              title="DLQ зустрічей · sync errors"
              description="Sync операції що 1С відмовила MAX_RETRIES разів. Оператор може зробити retry (новий шанс) або skip (визнати втрату)."
              ready
            />
            {/* Manual sync trigger — для preview deployments де Vercel cron не
                запускається. Також для оперативного recovery після cron-аварії. */}
            <SyncMeetingsCard />
          </AdminSection>
        </div>
      </main>
    </>
  );
}

interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  durationMs: number;
}

function SyncMeetingsCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const trigger = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sync-meetings-now', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setResult(body);
      setLastRun(new Date().toLocaleString('uk-UA'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-5 mt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Calendar className="h-4 w-4 text-emerald-700" />
        </div>
        <div>
          <p className="text-[14px] font-bold">Sync зустрічей вручну</p>
          <p className="text-[11px] text-muted-foreground">
            Та сама логіка що cron-worker (Supabase → 1С). Корисно на preview
            deployments де Vercel cron не запускається, або для recovery після аварії.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={trigger}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emet-blue to-emet-blue-light text-white text-[13px] font-bold shadow-sm hover:shadow-md active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Синхронізую…' : 'Запустити sync зараз'}
        </button>
        {lastRun && (
          <span className="text-[11px] text-muted-foreground">
            Останній запуск: {lastRun}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-700 inline-flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Помилка: {error}</span>
        </div>
      )}

      {result && !error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800 inline-flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Оброблено: <strong>{result.processed}</strong> ·
            успіх: <strong className="text-emerald-700">{result.succeeded}</strong> ·
            помилок: <strong className={result.failed > 0 ? 'text-rose-700' : ''}>{result.failed}</strong> ·
            пропущено: <strong>{result.skipped}</strong> ·
            тривалість: <strong>{result.durationMs}ms</strong>
            {result.dryRun && ' · DRY-RUN'}
          </span>
        </div>
      )}
    </div>
  );
}

function AdminSection({ title, accent, children }: {
  title: string; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className={`text-[11px] font-bold uppercase tracking-wider mb-2.5 ${accent ? 'text-emet-blue' : 'text-muted-foreground'}`}>{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function AdminCard({ icon, title, description, ready, href }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  ready?: boolean;
  href?: string;
}) {
  const Wrapper: React.ElementType = href && ready ? Link : 'div';
  const wrapperProps = href && ready ? { href } : {};
  return (
    <Wrapper
      {...wrapperProps}
      className={`block glass-card p-5 ${ready ? 'hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">{icon}</div>
        <p className="text-[14px] font-bold">{title}</p>
        {!ready && (
          <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emet-50 text-emet-blue font-bold">
            Інлайн у формі
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
    </Wrapper>
  );
}
