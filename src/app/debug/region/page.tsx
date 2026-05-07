'use client';

/**
 * DEBUG-сторінка для перевірки сирої відповіді Action 5 (getRegionData) з 1С.
 *
 * Призначення: перш ніж wire-ити Action 5 у RM/Director дашборди — перевірити
 * що 1С реально повертає (структура полів, формат чисел/дат, наявність regionCode).
 *
 * Після того як Action 5 успішно підключений — ЦЮ СТОРІНКУ ВИДАЛИТИ.
 *
 * Доступ: тільки залогіненим (cookie session), бо /api/onec за auth-gateом.
 */

import { useState } from 'react';
import { callOneC } from '@/lib/onec-client';
import { useAppStore } from '@/lib/store';

export default function DebugRegionPage() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const currentPeriod = useAppStore(s => s.currentPeriod);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFetch = async () => {
    if (!user) {
      setError('Спочатку залогінься на головній сторінці.');
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);
    setCopied(false);
    try {
      const period = currentPeriod.month.slice(0, 7); // YYYY-MM
      const data = await callOneC('getRegionData', {
        login: user.login,
        period,
      });
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen p-6 max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Debug: Action 5 (getRegionData)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Перевірка реальної відповіді 1С перш ніж wire-ити у дашборди.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 space-y-2 border border-[#e2e7ef]">
        <p className="text-sm">
          <span className="text-muted-foreground">Логін:</span>{' '}
          <span className="font-mono font-semibold">
            {!bootstrapped ? '— перевіряю сесію... —' : (user?.login || '— не залогінений —')}
          </span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Роль:</span>{' '}
          <span className="font-semibold">{user?.role || '—'}</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Період запиту:</span>{' '}
          <span className="font-mono font-semibold">{currentPeriod.month.slice(0, 7)}</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Очікується:</span>{' '}
          {user?.role === 'director'
            ? '8 регіонів у regions[]'
            : user?.role === 'rm'
            ? '1 регіон у regions[] (свій)'
            : 'для менеджера Action 5 не призначений (роль = manager)'}
        </p>
      </div>

      <button
        onClick={handleFetch}
        disabled={loading || !user}
        className="bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
      >
        {loading ? 'Запитую 1С...' : 'Запитати Action 5'}
      </button>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {response !== null && (
        <div className="bg-white rounded-2xl border border-[#e2e7ef] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#e2e7ef] bg-[#f4f7fb]">
            <span className="text-sm font-semibold">Відповідь 1С (сирий JSON)</span>
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1 rounded-lg bg-[#066aab] text-white hover:bg-[#055a91]"
            >
              {copied ? '✓ Скопійовано' : 'Скопіювати'}
            </button>
          </div>
          <pre className="p-4 text-[11px] font-mono overflow-x-auto whitespace-pre">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
