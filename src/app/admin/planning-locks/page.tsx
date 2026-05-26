'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ArrowLeft, Lock, Unlock, Settings2, Trash2, Plus, Save, Clock } from 'lucide-react';

interface PlanningLockRow {
  id: number;
  scope: 'global' | 'user';
  user_login: string | null;
  month: string;
  type: 'block' | 'allow';
  reason: string | null;
  created_by: string;
  created_at: string;
}

interface SettingsResp {
  windowDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

const HEADERS_JSON = { 'Content-Type': 'application/json' };  // same-origin auth via Sec-Fetch-Site (api-auth.ts)

export default function AdminPlanningLocksPage() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  // Current month як default фільтр / для нового lock.
  const currentMonthStart = new Date().toISOString().slice(0, 7) + '-01';
  const [month, setMonth] = useState(currentMonthStart);

  // ---- Settings (window_days) ----
  const { data: settings, mutate: mutateSettings } = useSWR<SettingsResp>(
    user?.role === 'admin' ? 'admin-settings' : null,
    async () => {
      const r = await fetch('/api/admin/planning-settings', { credentials: 'include', headers: HEADERS_JSON });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  );
  const [windowDaysDraft, setWindowDaysDraft] = useState<number | null>(null);
  useEffect(() => { if (settings?.windowDays && windowDaysDraft === null) setWindowDaysDraft(settings.windowDays); }, [settings, windowDaysDraft]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  async function saveSettings() {
    if (windowDaysDraft === null) return;
    setSavingSettings(true); setSettingsMsg(null);
    const r = await fetch('/api/admin/planning-settings', {
      method: 'PUT', credentials: 'include', headers: HEADERS_JSON,
      body: JSON.stringify({ windowDays: windowDaysDraft }),
    });
    const data = await r.json().catch(() => ({}));
    setSavingSettings(false);
    if (r.ok) { setSettingsMsg('Збережено'); mutateSettings(); }
    else setSettingsMsg(data?.error || `HTTP ${r.status}`);
    setTimeout(() => setSettingsMsg(null), 3000);
  }

  // ---- Locks list ----
  const locksKey = user?.role === 'admin' ? `admin-locks|${month}` : null;
  const { data: locksResp, mutate: mutateLocks } = useSWR<{ locks: PlanningLockRow[] }>(
    locksKey,
    async () => {
      const params = new URLSearchParams({ month });
      const r = await fetch(`/api/admin/planning-locks?${params.toString()}`, { credentials: 'include', headers: HEADERS_JSON });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  );
  const locks = locksResp?.locks ?? [];

  // ---- New lock form ----
  const [scope, setScope] = useState<'global' | 'user'>('global');
  const [userLogin, setUserLogin] = useState('');
  const [type, setType] = useState<'block' | 'allow'>('block');
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  async function createLock() {
    if (scope === 'user' && !userLogin.trim()) {
      setCreateMsg('Введіть логін менеджера для scope=user');
      setTimeout(() => setCreateMsg(null), 3000);
      return;
    }
    setCreating(true); setCreateMsg(null);
    const r = await fetch('/api/admin/planning-locks', {
      method: 'POST', credentials: 'include', headers: HEADERS_JSON,
      body: JSON.stringify({ scope, userLogin: scope === 'user' ? userLogin : undefined, month, type, reason: reason || undefined }),
    });
    const data = await r.json().catch(() => ({}));
    setCreating(false);
    if (r.ok) {
      setCreateMsg('Створено');
      setUserLogin(''); setReason('');
      mutateLocks();
    } else {
      setCreateMsg(data?.error || `HTTP ${r.status}`);
    }
    setTimeout(() => setCreateMsg(null), 3000);
  }

  async function deleteLock(id: number) {
    if (!confirm('Видалити лок?')) return;
    const r = await fetch(`/api/admin/planning-locks?id=${id}`, { method: 'DELETE', credentials: 'include', headers: HEADERS_JSON });
    if (r.ok) mutateLocks();
    else { const data = await r.json().catch(() => ({})); alert(data?.error || `HTTP ${r.status}`); }
  }

  if (!user) return null;
  if (user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <Link href="/admin" className="inline-flex items-center gap-1.5 hover:text-foreground cursor-pointer">
            <ArrowLeft className="h-4 w-4" /> Адмін-панель
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Блокування планування</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/15">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Блокування планування</h1>
            <p className="text-[12px] text-muted-foreground">Графік + персональні правила доступу до планування</p>
          </div>
        </div>

        {/* Window-days settings */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emet-50 flex items-center justify-center"><Clock className="h-4 w-4 text-emet-blue" /></div>
            <h2 className="text-[14px] font-bold">Графік планування</h2>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            Скільки перших днів місяця менеджери можуть редагувати плани. Поза цим вікном — лише адмін
            (або менеджери з персональним allow-локом).
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-[200px]">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Днів місяця</label>
              <Input
                type="number" min={1} max={31}
                value={windowDaysDraft ?? ''}
                onChange={(e) => setWindowDaysDraft(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                className="h-10"
              />
            </div>
            <Button
              onClick={saveSettings}
              disabled={savingSettings || windowDaysDraft === null}
              className="gap-2 h-10 bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white"
            >
              <Save className="h-4 w-4" /> {savingSettings ? 'Збереження…' : 'Зберегти'}
            </Button>
            {settingsMsg && (
              <span className={`text-[12px] ${settingsMsg === 'Збережено' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {settingsMsg}
              </span>
            )}
          </div>
          {settings?.updatedAt && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Останнє оновлення: {new Date(settings.updatedAt).toLocaleString('uk-UA')} · {settings.updatedBy || '—'}
            </p>
          )}
        </section>

        {/* Month selector */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-3">
            <label className="text-[12px] font-medium text-muted-foreground">Місяць</label>
            <Input
              type="month" value={month.slice(0, 7)}
              onChange={(e) => setMonth(e.target.value ? e.target.value + '-01' : currentMonthStart)}
              className="h-9 w-[180px]"
            />
            <span className="text-[11px] text-muted-foreground">Локи нижче діють лише на цей місяць</span>
          </div>
        </section>

        {/* New lock form */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center"><Plus className="h-4 w-4 text-rose-700" /></div>
            <h2 className="text-[14px] font-bold">Додати лок</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Кому</label>
              <Select value={scope} onValueChange={(v) => setScope(v as 'global' | 'user')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Усім менеджерам</SelectItem>
                  <SelectItem value="user">Конкретному</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={scope === 'user' ? '' : 'opacity-40'}>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Логін менеджера</label>
              <Input
                value={userLogin} onChange={(e) => setUserLogin(e.target.value)}
                disabled={scope !== 'user'}
                placeholder="sm.kiev4@emet.in.ua" className="h-9"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Тип</label>
              <Select value={type} onValueChange={(v) => setType(v as 'block' | 'allow')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Заблокувати</SelectItem>
                  <SelectItem value="allow">Дозволити (обхід графіка)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Причина (опц.)</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Button
              onClick={createLock} disabled={creating}
              className="gap-2 h-9 bg-rose-600 hover:bg-rose-700 text-white"
            >
              <Plus className="h-4 w-4" /> {creating ? 'Додаю…' : 'Додати'}
            </Button>
            {createMsg && (
              <span className={`text-[12px] ${createMsg === 'Створено' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {createMsg}
              </span>
            )}
          </div>
        </section>

        {/* Locks list */}
        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emet-50 flex items-center justify-center"><Settings2 className="h-4 w-4 text-emet-blue" /></div>
            <h2 className="text-[14px] font-bold">Активні локи · {month.slice(0, 7)}</h2>
          </div>
          {locks.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Для цього місяця локів немає — діє стандартний графік ({settings?.windowDays || 5} днів).</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase text-muted-foreground tracking-wider border-b border-[#e2e7ef]">
                  <th className="text-left py-2 font-medium">Тип</th>
                  <th className="text-left py-2 font-medium">Кому</th>
                  <th className="text-left py-2 font-medium">Причина</th>
                  <th className="text-left py-2 font-medium">Створено</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {locks.map(l => (
                  <tr key={l.id} className="border-b border-[#f3f4f6] last:border-0">
                    <td className="py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        l.type === 'block' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {l.type === 'block' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        {l.type === 'block' ? 'Блок' : 'Дозвіл'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {l.scope === 'global'
                        ? <span className="font-medium">Усі менеджери</span>
                        : <span className="font-mono text-[12px]">{l.user_login}</span>
                      }
                    </td>
                    <td className="py-2.5 text-muted-foreground">{l.reason || '—'}</td>
                    <td className="py-2.5 text-muted-foreground text-[11px]">
                      {new Date(l.created_at).toLocaleString('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      <br/><span className="text-[10px]">{l.created_by}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => deleteLock(l.id)}
                        className="p-1.5 rounded-md hover:bg-rose-50 text-muted-foreground hover:text-rose-700 transition-colors cursor-pointer"
                        title="Видалити"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
