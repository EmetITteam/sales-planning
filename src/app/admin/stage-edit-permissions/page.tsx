'use client';

/**
 * /admin/stage-edit-permissions — toggle дозволу редагувати etap після фіналу.
 *
 * Для кожного менеджера є checkbox `can_edit_stages_after_finalize`. Коли ON —
 * у формі планування його stage select лишається активним навіть після
 * фіналізації (амоунти і список клієнтів залишаються locked).
 *
 * Тільки admin.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Settings2, CheckCircle2, Circle, Search } from 'lucide-react';

interface UserRow {
  login: string;
  fullName: string;
  role: string;
  region: string | null;
  regionCode: string | null;
  canEditStagesAfterFinalize: boolean;
}

const HEADERS_JSON = { 'Content-Type': 'application/json' };  // same-origin auth via Sec-Fetch-Site (api-auth.ts)

export default function AdminStageEditPermissionsPage() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const [search, setSearch] = useState('');
  const [pendingLogin, setPendingLogin] = useState<string | null>(null);

  const { data, mutate } = useSWR<{ users: UserRow[] }>(
    user?.role === 'admin' ? 'admin-stage-edit-permissions' : null,
    async () => {
      const r = await fetch('/api/admin/stage-edit-permissions', { credentials: 'include', headers: HEADERS_JSON });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    { revalidateOnFocus: false },
  );

  async function toggle(login: string, currentValue: boolean) {
    setPendingLogin(login);
    try {
      const r = await fetch('/api/admin/stage-edit-permissions', {
        method: 'POST',
        credentials: 'include',
        headers: HEADERS_JSON,
        body: JSON.stringify({ login, value: !currentValue }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        alert(`Помилка: ${r.status} ${t.slice(0, 200)}`);
        return;
      }
      await mutate();
    } finally {
      setPendingLogin(null);
    }
  }

  if (!user) return null;
  if (user.role !== 'admin') return null;

  const users = (data?.users ?? [])
    // Тільки manager / rm — admin / director не планують, для них toggle безсенсу
    .filter(u => u.role === 'manager' || u.role === 'rm')
    .filter(u => {
      if (!search) return true;
      const s = search.toLowerCase();
      return u.fullName.toLowerCase().includes(s)
        || u.login.toLowerCase().includes(s)
        || (u.region || '').toLowerCase().includes(s);
    });

  const enabledCount = (data?.users ?? []).filter(u => u.canEditStagesAfterFinalize).length;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-5xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Назад до адмін-панелі
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white flex items-center justify-center shadow-lg shadow-blue-500/15">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Редагування етапу після фіналізації</h1>
            <p className="text-[12px] text-muted-foreground">
              Дозвіл міняти поле «Етап» (Дзвінок/Зустріч/Навчання/Мессенджер) у формі планування навіть коли план уже фіналізований. Суми, список клієнтів і структура — лишаються заблокованими.
            </p>
          </div>
        </div>

        <div className="bg-amber-50/60 backdrop-blur-md border border-amber-200/70 rounded-2xl px-4 py-3 text-[12px] text-amber-800">
          <p className="font-semibold">Як це працює:</p>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li>Галочка ON → менеджер у формі бачить розблокований dropdown «Етап»</li>
            <li>Галочка OFF → форма заблокована після фіналу (як зараз)</li>
            <li>Зміна вступає в силу при наступному вході менеджера або refresh сторінки</li>
          </ul>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f0f2f8] flex items-center gap-3">
            <Search className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за ПІБ, логіном або регіоном..."
              className="flex-1 h-8 text-[13px] border-0 shadow-none focus-visible:ring-0"
            />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {users.length} / {(data?.users ?? []).filter(u => u.role === 'manager' || u.role === 'rm').length}
            </span>
          </div>

          <div className="divide-y divide-[#f0f2f8]">
            {users.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                {data ? 'Нічого не знайдено' : 'Завантаження...'}
              </div>
            ) : (
              users.map(u => (
                <button
                  key={u.login}
                  onClick={() => toggle(u.login, u.canEditStagesAfterFinalize)}
                  disabled={pendingLogin === u.login}
                  className="w-full grid grid-cols-[28px_1fr_120px_70px_28px] gap-3 items-center px-4 py-3 hover:bg-[#fafbfe] text-left cursor-pointer disabled:opacity-50"
                >
                  {u.canEditStagesAfterFinalize ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/30" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold truncate">{u.fullName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{u.login}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{u.region || '—'}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 text-center ${u.role === 'rm' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {u.role === 'rm' ? 'РМ' : 'Менедж.'}
                  </span>
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 text-center whitespace-nowrap ${u.canEditStagesAfterFinalize ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {u.canEditStagesAfterFinalize ? 'ON' : 'OFF'}
                  </span>
                </button>
              ))
            )}
          </div>

          {enabledCount > 0 && (
            <div className="px-4 py-2 bg-[#fafbfe] text-[11px] text-muted-foreground border-t border-[#f0f2f8]">
              Активно для <span className="font-bold text-emerald-700">{enabledCount}</span> менеджерів
            </div>
          )}
        </div>
      </main>
    </>
  );
}
