'use client';

/**
 * /region-access — управління тимчасовим доступом менеджера до перегляду
 * всього регіону (планёрки).
 *
 * Доступ: директор продажів (sdu) + асистент директора + admin
 * (canManageRegionAccess — гейт по логіну). Admin заходить сюди з Адмін-панелі,
 * директор/асистент — з пункту у меню акаунта.
 *
 * Створено 2026-07-14.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { useOneCData } from '@/lib/use-onec-data';
import { adaptRegionData } from '@/lib/onec-adapters';
import { canManageRegionAccess, isAdminLogin } from '@/lib/feature-flags';
import { ArrowLeft, Building2, Plus, X, AlertCircle, CheckCircle2, Loader2, Ban } from 'lucide-react';

interface Grant {
  id: string;
  manager_login: string;
  region_code: string;
  region_name: string | null;
  manager_name: string | null;
  valid_from: string;
  valid_to: string;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function RegionAccessPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const allowed = canManageRegionAccess(user?.login);

  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [draft, setDraft] = useState({
    region_code: '',
    manager_login: '',
    valid_from: todayIso(),
    valid_to: todayIso(),
  });

  // Регіони + менеджери для дропдаунів — з getRegionData (директор бачить усі).
  const periodKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const { data: regionResp } = useOneCData(
    'getRegionData',
    allowed && user ? { login: user.login, period: periodKey, asOfDate: todayIso() } : null,
  );
  const regions = useMemo(() => {
    if (!regionResp) return [];
    return adaptRegionData(regionResp).regions
      .filter(r => r.regionCode)
      .sort((a, b) => a.regionName.localeCompare(b.regionName, 'uk'));
  }, [regionResp]);
  const managersOfRegion = useMemo(
    () => regions.find(r => r.regionCode === draft.region_code)?.managers ?? [],
    [regions, draft.region_code],
  );

  useEffect(() => {
    if (user && !allowed) router.replace('/');
  }, [user, allowed, router]);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/region-access', { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: { grants?: Grant[]; error?: string }) => {
        if (s.error) throw new Error(s.error);
        setGrants(s.grants ?? []);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  const create = async () => {
    setSubmitting(true);
    setError(null);
    setSavedMsg(null);
    try {
      const region = regions.find(r => r.regionCode === draft.region_code);
      const mgr = managersOfRegion.find(m => m.login === draft.manager_login);
      const r = await fetch('/api/admin/region-access', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manager_login: draft.manager_login,
          region_code: draft.region_code,
          region_name: region?.regionName ?? null,
          manager_name: mgr?.name ?? null,
          valid_from: draft.valid_from,
          valid_to: draft.valid_to,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setSavedMsg('Доступ надано');
      setShowCreate(false);
      setDraft(d => ({ ...d, region_code: '', manager_login: '' }));
      load();
      setTimeout(() => setSavedMsg(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Відкликати доступ достроково? Менеджер одразу втратить перегляд регіону.')) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/region-access?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      load();
      setSavedMsg('Доступ відкликано');
      setTimeout(() => setSavedMsg(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || !allowed) return null;

  const today = todayIso();
  const statusOf = (g: Grant): { label: string; cls: string } => {
    if (g.revoked_at) return { label: 'відкликано', cls: 'bg-slate-500/12 border-slate-300/50 text-slate-600' };
    if (today < g.valid_from) return { label: 'заплановано', cls: 'bg-sky-500/12 border-sky-300/50 text-sky-700' };
    if (today > g.valid_to) return { label: 'завершено', cls: 'bg-slate-500/12 border-slate-300/50 text-slate-600' };
    return { label: 'активний', cls: 'bg-emerald-500/12 border-emerald-300/50 text-emerald-700' };
  };

  const backHref = isAdminLogin(user.login) ? '/admin' : '/';

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-4xl mx-auto space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> {isAdminLogin(user.login) ? 'Адмін-панель' : 'На головну'}
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Тимчасовий доступ до регіону</h1>
            <p className="text-[12px] text-muted-foreground">
              Менеджер бачить весь регіон (планування) на час планёрки
            </p>
          </div>
        </div>

        {/* Як працює */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-[13px] font-bold">Як працює</h2>
          <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Обираєш представництво → менеджера цього регіону → період (дати).</li>
            <li>На цей час менеджер отримує у шапці перемикач і бачить <b>увесь регіон</b> у блоці «Планування» (план/факт усіх менеджерів) — щоб відзвітувати.</li>
            <li>Тільки перегляд — чужі плани він не редагує.</li>
            <li>Після кінцевої дати доступ зникає сам. «Відкликати» — прибрати достроково.</li>
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
          <h2 className="text-[14px] font-bold">Видані доступи</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emet-blue text-white text-[13px] font-bold hover:bg-emet-blue/90 active:translate-y-px transition-all"
          >
            <Plus className="h-4 w-4" />
            Надати доступ
          </button>
        </div>

        {loading && (
          <div className="glass-card p-5 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантажую…
          </div>
        )}

        {grants && grants.length === 0 && !loading && (
          <div className="glass-card p-8 text-center text-[13px] text-muted-foreground">
            Доступів ще немає. Надай перший — наприклад менеджеру Києва на тиждень планёрки.
          </div>
        )}

        {grants && grants.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1fr_110px_110px_100px_110px] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-[#e2e7ef]">
              <span>Менеджер</span>
              <span>Регіон</span>
              <span>З</span>
              <span>До</span>
              <span>Статус</span>
              <span className="text-right">Дії</span>
            </div>
            {grants.map(g => {
              const st = statusOf(g);
              const canRevoke = !g.revoked_at && today <= g.valid_to;
              return (
                <div key={g.id} className="grid grid-cols-[1.4fr_1fr_110px_110px_100px_110px] gap-3 px-4 py-3 items-center text-[13px] border-b border-[#f0f2f8] last:border-b-0">
                  <div>
                    <p className="font-bold">{g.manager_name || g.manager_login}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {g.granted_by} · {new Date(g.created_at).toLocaleDateString('uk-UA')}
                    </p>
                  </div>
                  <span className="text-[12px]">{g.region_name || g.region_code}</span>
                  <span className="tabular-nums text-[12px]">{g.valid_from}</span>
                  <span className="tabular-nums text-[12px]">{g.valid_to}</span>
                  <span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${st.cls}`}>
                      {st.label}
                    </span>
                  </span>
                  <div className="flex items-center justify-end">
                    {canRevoke && (
                      <button
                        onClick={() => revoke(g.id)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                        title="Відкликати достроково"
                      >
                        <Ban className="h-3 w-3" /> Відкликати
                      </button>
                    )}
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
                <h3 className="text-[15px] font-bold">Надати доступ до регіону</h3>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Представництво</span>
                <select
                  value={draft.region_code}
                  onChange={e => setDraft(d => ({ ...d, region_code: e.target.value, manager_login: '' }))}
                  className="mt-1.5 w-full h-11 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                >
                  <option value="">— обери регіон —</option>
                  {regions.map(r => (
                    <option key={r.regionCode} value={r.regionCode}>{r.regionName}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Менеджер</span>
                <select
                  value={draft.manager_login}
                  onChange={e => setDraft(d => ({ ...d, manager_login: e.target.value }))}
                  disabled={!draft.region_code}
                  className="mt-1.5 w-full h-11 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe] disabled:opacity-50"
                >
                  <option value="">{draft.region_code ? '— обери менеджера —' : 'спершу регіон'}</option>
                  {managersOfRegion.map(m => (
                    <option key={m.login} value={m.login}>{m.name || m.login}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">З дати</span>
                  <input
                    type="date"
                    value={draft.valid_from}
                    onChange={e => setDraft(d => ({ ...d, valid_from: e.target.value, valid_to: d.valid_to < e.target.value ? e.target.value : d.valid_to }))}
                    className="mt-1.5 w-full h-11 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">До дати</span>
                  <input
                    type="date"
                    value={draft.valid_to}
                    min={draft.valid_from}
                    onChange={e => setDraft(d => ({ ...d, valid_to: e.target.value }))}
                    className="mt-1.5 w-full h-11 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe]"
                  />
                </label>
              </div>

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
                  disabled={submitting || !draft.region_code || !draft.manager_login || !draft.valid_from || !draft.valid_to}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white bg-emet-blue hover:bg-emet-blue/90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Надати
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
