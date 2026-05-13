'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { Shield, Lock, Clock, Settings2 } from 'lucide-react';

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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#991b1b] to-[#dc2626] text-white flex items-center justify-center shadow-lg shadow-rose-500/15">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Адмін-панель</h1>
            <p className="text-[12px] text-muted-foreground">Керування плануванням і доступом</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PlaceholderCard
            icon={<Lock className="h-4 w-4 text-amber-700" />}
            title="Блокування планування"
            description="Відкривати/закривати редагування планів для конкретних менеджерів або всім одразу."
            stage="Етап 3"
          />
          <PlaceholderCard
            icon={<Clock className="h-4 w-4 text-amber-700" />}
            title="Графік планування"
            description="Скільки днів місяця менеджери можуть планувати (за замовч.: перші 5)."
            stage="Етап 3"
          />
          <PlaceholderCard
            icon={<Settings2 className="h-4 w-4 text-amber-700" />}
            title="Розфіналізація планів"
            description="Скасувати фіналізацію плану для конкретного (менеджер × бренд × місяць)."
            stage="Етап 2"
          />
        </div>
      </main>
    </>
  );
}

function PlaceholderCard({ icon, title, description, stage }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">{icon}</div>
        <p className="text-[14px] font-bold">{title}</p>
        <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e8f4fc] text-[#066aab] font-bold">
          {stage}
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
      <p className="text-[11px] text-muted-foreground/60 mt-2">У розробці</p>
    </div>
  );
}
