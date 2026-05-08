'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { apiLogin, LoginError } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, AlertTriangle } from 'lucide-react';

export function LoginForm() {
  const setUser = useAppStore((s) => s.setUser);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ msg: string; isInfra: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const user = await apiLogin({ login, password });
      setUser(user);
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
      const user = await apiLogin({ login: loginKey, demo: true });
      setUser(user);
    } catch (err) {
      const isInfra = err instanceof LoginError && err.status === 502;
      setError({ msg: err instanceof Error ? err.message : 'Demo login failed', isInfra });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8f4fc] via-white to-[#e8f4fc] p-4">
      {/* Decorative circles */}
      <div className="fixed top-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-[#c5e3f6]/40 blur-3xl" />
      <div className="fixed bottom-[-150px] left-[-100px] w-[400px] h-[400px] rounded-full bg-[#c5e3f6]/40 blur-3xl" />

      <div className="w-full max-w-[380px] relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-lg shadow-[#066aab]/15 border border-border/50 mb-4 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/emet-logo.png" alt="EMET" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#066aab] to-[#0880cc] bg-clip-text text-transparent">
            Sales Planning
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Планування та контроль продажів</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl shadow-[#066aab]/10 border border-border/50 p-6">
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
              className="w-full h-10 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#066aab] shadow-md shadow-[#066aab]/20 transition-all disabled:opacity-50"
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
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 hover:bg-[#e8f4fc] hover:border-[#c5e3f6] transition-all text-sm font-medium text-foreground/80 cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
