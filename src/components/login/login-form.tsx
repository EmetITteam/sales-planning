'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { MOCK_USERS } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart3, ArrowRight } from 'lucide-react';

export function LoginForm() {
  const setUser = useAppStore((s) => s.setUser);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = MOCK_USERS[login];
    if (user && password === 'demo') {
      setUser(user);
    } else {
      setError('Невірний логін або пароль');
    }
  };

  const quickLogin = (loginKey: string) => {
    const user = MOCK_USERS[loginKey];
    if (user) setUser(user);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#e8f4fc] via-white to-[#e8f4fc] p-4">
      {/* Decorative circles */}
      <div className="fixed top-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-[#c5e3f6]/40 blur-3xl" />
      <div className="fixed bottom-[-150px] left-[-100px] w-[400px] h-[400px] rounded-full bg-[#c5e3f6]/40 blur-3xl" />

      <div className="w-full max-w-[380px] relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/20 mb-4">
            <BarChart3 className="h-7 w-7" />
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
                onChange={(e) => { setLogin(e.target.value); setError(''); }}
                className="h-10 bg-muted/30 border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Пароль</label>
              <Input
                type="password"
                placeholder="Введіть пароль"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="h-10 bg-muted/30 border-border/60"
              />
            </div>
            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
            <Button type="submit" className="w-full h-10 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#066aab] shadow-md shadow-[#066aab]/20 transition-all">
              Увійти
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground text-center mb-3 uppercase tracking-wider">Швидкий вхід</p>
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
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 hover:bg-[#e8f4fc] hover:border-[#c5e3f6] transition-all text-sm font-medium text-foreground/80 cursor-pointer"
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
