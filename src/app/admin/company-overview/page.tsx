'use client';

/**
 * /admin/company-overview — «Огляд компанії».
 *
 * Read-only візуалізація план/факт по всій компанії включно з не-планувальними
 * підрозділами (Колл-центр, Лазерхауз, Адасса, Чугуй=Полтава, Хайленко=Чернівці).
 *
 * Структура (узгоджена 2026-05-21 на preview-v2):
 *  - Hero (4 cards): план / факт / % виконання / без факту
 *  - Filters: період + група підрозділів
 *  - 3 Donut: регіони у Представництвах · підрозділи у компанії · бренди
 *  - Heatmap: 6 рядків (Підрозділи) × 9 колонок (Бренди)
 *  - Accordion: 2 режими (Підрозділи→бренди ⇄ Бренди→підрозділи)
 *
 * Доступ: тільки role === 'admin' (інакше redirect на /).
 *
 * 🚧 Скелет — компоненти будуть додаватись по черзі. Поки заглушки + ссилки.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { ArrowLeft, Building2, Wrench } from 'lucide-react';

export default function CompanyOverviewPage() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-[1400px] mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Назад до адмін-панелі
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#5bd5bc] text-white flex items-center justify-center shadow-lg shadow-blue-500/15">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Огляд компанії</h1>
            <p className="text-[12px] text-muted-foreground">
              Усі 13 підрозділів — план/факт без фільтра по плануванню. Read-only.
            </p>
          </div>
        </div>

        {/* 🚧 Заглушка — поетапно будуть додаватись справжні компоненти.
            Поки що нагадує що це WIP і ссилається на preview. */}
        <div className="glass-card p-12 text-center space-y-4">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-amber-50/60 backdrop-blur-md border border-amber-200/70 items-center justify-center">
            <Wrench className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <p className="text-[15px] font-bold">Сторінка у розробці</p>
            <p className="text-[13px] text-muted-foreground max-w-md mx-auto mt-1">
              Компоненти будуть додаватись поетапно. Доступ — лише admin.
              Поки що подивись прев'ю-макет як це буде виглядати.
            </p>
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <a
              href="/admin-overview-preview-v2.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white text-[13px] font-semibold hover:from-[#055a91] hover:to-[#0775bb] transition-all shadow-md shadow-blue-500/20"
            >
              Відкрити preview макет ↗
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Контент скелета:<br />
            Hero (4 cards) · Filters (період + група) · 3 Donut · Heatmap (6×9) · Accordion (2 режими)
          </p>
        </div>
      </main>
    </>
  );
}
