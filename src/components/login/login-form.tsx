'use client';

import { useEffect, useState } from 'react';
import { apiLogin, LoginError } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, AlertTriangle, ShieldAlert, Lock } from 'lucide-react';

export function LoginForm() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ msg: string; isInfra: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  // System lock state — перевіряємо при mount. Якщо locked → показуємо
  // банер «Система на обслуговуванні» замість форми. Adminам — toggle «Я admin».
  const [systemLock, setSystemLock] = useState<{ locked: boolean; reason: string | null } | null>(null);
  const [showAdminForm, setShowAdminForm] = useState(false);

  useEffect(() => {
    fetch('/api/system-status', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then((s: { locked: boolean; reason: string | null } | null) => {
        if (s) setSystemLock(s);
      })
      .catch(() => {/* fail-open: показуємо звичайний login */});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await apiLogin({ login, password });
      // Повний reload замість setUser: SessionBootstrap перечитає /api/auth/me
      // (нова cookie) і ВСІ фетчі стартують з чистого стану. SPA-перехід при
      // зміні користувача лишав порожні дані/сповіщення до ручного оновлення
      // (re-login гонка: стара SWR/сесія/nav). Reload це прибирає.
      window.location.assign('/');
      return;
    } catch (err) {
      // 502 (1С недоступний) показуємо інакше ніж 401 — щоб менеджер не думав що
      // він невірно ввів пароль і не повторював 10 разів.
      const isInfra = err instanceof LoginError && (err.status === 502 || err.code === 'onec_unavailable' || err.code === 'onec_invalid_response');
      const msg = err instanceof Error ? err.message : 'Невідома помилка';
      setError({ msg, isInfra });
    } finally {
      setLoading(false);
    }
  };

  // Демо-кнопки за замовчуванням ВИМКНЕНІ — opt-in через NEXT_PUBLIC_DEMO_LOGIN=true.
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true';
  const quickLogin = async (loginKey: string) => {
    setError(null);
    setLoading(true);
    try {
      await apiLogin({ login: loginKey, demo: true });
      window.location.assign('/');
      return;
    } catch (err) {
      const isInfra = err instanceof LoginError && err.status === 502;
      setError({ msg: err instanceof Error ? err.message : 'Demo login failed', isInfra });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emet-50 via-white to-emet-50 p-4">
      {/* Decorative circles */}
      <div className="fixed top-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-emet-100/40 blur-3xl" />
      <div className="fixed bottom-[-150px] left-[-100px] w-[400px] h-[400px] rounded-full bg-emet-100/40 blur-3xl" />

      <div className="w-full max-w-[380px] relative">
        {/* Logo — горизонтальний lockup на всю ширину блоку */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emet-logo.svg" alt="EMET" className="mx-auto mb-6 h-14 w-auto max-w-full" />
          <h1 className="text-2xl font-bold tracking-tight text-[#081E2D]">
            Планування продажів
          </h1>
        </div>

        {/* System lock banner — показуємо замість форми коли система заблокована.
            Admin може клікнути «Я admin» щоб розкрити форму вводу credentials. */}
        {systemLock?.locked && !showAdminForm && (
          <div className="bg-white rounded-2xl shadow-xl shadow-rose-500/10 border border-rose-200/60 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-600 to-rose-500 text-white flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-[15px] font-bold text-rose-700">Система на обслуговуванні</h2>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Тимчасово недоступна. Спробуйте пізніше.
                </p>
                {systemLock.reason && (
                  <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200/60">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-rose-700">Причина</p>
                    <p className="text-[12px] text-rose-900 mt-0.5">{systemLock.reason}</p>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAdminForm(true)}
              className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-2 underline decoration-dotted transition-colors"
            >
              <Lock className="inline h-3 w-3 mr-1" />
              Я адміністратор · увійти
            </button>
          </div>
        )}

        {/* Form — звичайний login (або admin-fallback при locked) */}
        {(!systemLock?.locked || showAdminForm) && (
        <div className="bg-white rounded-2xl shadow-xl shadow-emet-blue/10 border border-border/50 p-6">
          {systemLock?.locked && showAdminForm && (
            <div className="mb-4 -mx-2 -mt-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200/60 text-[11px] text-rose-700 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>Система заблокована. Доступ дозволено тільки адміну.</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={login}
                onChange={(e) => { setLogin(e.target.value); setError(null); }}
                disabled={loading}
                className="h-10 bg-muted/30 border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Пароль</label>
              <Input
                type="password"
                placeholder="Введіть пароль"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                disabled={loading}
                className="h-10 bg-muted/30 border-border/60"
              />
            </div>
            {error && (
              error.isInfra ? (
                <div className="flex gap-2 items-start text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{error.msg}</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">Це не пов&apos;язано з вашим паролем.</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-rose-500 font-medium">{error.msg}</p>
              )
            )}
            <Button
              type="submit"
              disabled={loading || !login || !password}
              className="w-full h-10 bg-[#081E2D] hover:bg-[#0d2a3d] text-white shadow-md shadow-[#081E2D]/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Перевіряю...
                </>
              ) : (
                <>
                  Увійти
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {isDemoMode && (
            <div className="mt-5 pt-5 border-t border-border/50">
              <p className="text-[11px] text-muted-foreground text-center mb-3 uppercase tracking-wider">Швидкий вхід (demo)</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'feshchenko@emet.com', label: 'Менеджер', icon: '👤' },
                  { key: 'sirik@emet.com', label: 'Менеджер 2', icon: '👤' },
                  { key: 'rm.dnipro@emet.com', label: 'Рег. керівник', icon: '👥' },
                  { key: 'director@emet.com', label: 'Директор', icon: '👑' },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => quickLogin(item.key)}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 hover:bg-emet-50 hover:border-emet-100 transition-all text-sm font-medium text-foreground/80 cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
