'use client';

/**
 * Debug-сторінка для перевірки 1С-actions які тягне CRM-сторінка `/clients`.
 *
 * Доступ — admin або будь-хто залогінений (контролюється на стороні /api/onec).
 *
 * Що можна тут перевірити:
 *  1. `getManagerClients` → перевіряємо чи приходить `isReserved` (Action C),
 *     чи поле `ClientName`/`ClientAddress` правильно іменоване.
 *  2. `getClientReport(clientID)` → дивимось `properties[]` (звідки беремо «Резерв»),
 *     `lastCalls[]`, `lastMeetings[]`, `seminars[]`.
 *  3. `checkActivities({login, period, clientIds})` → перевіряємо чому `hasCall`
 *     показує `false` хоча у `getClientReport.lastCalls` є дзвінки.
 *
 * URL: /debug-clients-api
 */

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { LoginForm } from '@/components/login/login-form';
import { callOneC } from '@/lib/onec-client';
import { Loader2, RefreshCw, Search } from 'lucide-react';

export default function DebugClientsAPI() {
  const user = useAppStore(s => s.user);
  const bootstrapped = useAppStore(s => s.bootstrapped);
  const currentPeriod = useAppStore(s => s.currentPeriod);

  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState('');

  if (!bootstrapped) return <div className="p-8">Перевіряю сесію…</div>;
  if (!user) return <LoginForm />;

  async function call(label: string, fn: () => Promise<unknown>) {
    setError(null);
    setLoading(true);
    setOutput(`Виклик ${label}…`);
    try {
      const r = await fn();
      setOutput(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`${label}: ${msg}`);
      setOutput(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(245,158,11,0.25)]">
            🐛
          </div>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight">Debug · Clients API</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">Перевірка raw-відповідей 1С-actions які використовує /clients</p>
          </div>
        </div>

        {/* Login info */}
        <div className="glass-card-soft p-3 text-[12px] flex items-center gap-3 flex-wrap">
          <span><strong>Logged-in:</strong> <code className="text-emet-blue">{user.login}</code></span>
          <span>·</span>
          <span><strong>Role:</strong> {user.role}</span>
          <span>·</span>
          <span><strong>Period:</strong> {currentPeriod.month}</span>
        </div>

        {/* Buttons */}
        <div className="glass-card p-4 space-y-3">
          <h2 className="text-[13px] font-bold">1. getManagerClients (bulk список)</h2>
          <p className="text-[11px] text-muted-foreground">Перевір shape перших клієнтів — чи приходить `isReserved`, як саме називається name/address.</p>
          <button
            type="button"
            onClick={() => call('getManagerClients', () => callOneC('getManagerClients', { login: user.login }))}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-emet-blue text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <RefreshCw className="h-4 w-4 inline mr-2" />}
            Викликати getManagerClients
          </button>
        </div>

        <div className="glass-card p-4 space-y-3">
          <h2 className="text-[13px] font-bold">2. getClientReport (для одного клієнта)</h2>
          <p className="text-[11px] text-muted-foreground">
            Введи ClientID і клік. У відповіді шукаємо:
            <br />• <code>clientInfo.properties[]</code> — там має бути «Резерв» якщо клієнт у резерві
            <br />• <code>lastCalls[]</code>, <code>lastMeetings[]</code>, <code>seminars[]</code> — справжні події
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="ClientID (наприклад 380502837016)"
              className="flex-1 min-w-[200px] h-10 px-3 rounded-xl bg-white/50 border border-white/60 text-[13px] font-mono"
            />
            <button
              type="button"
              onClick={() => call('getClientReport', () => callOneC('getClientReport', { clientID: clientId.trim() }))}
              disabled={loading || !clientId.trim()}
              className="px-4 py-2 rounded-xl bg-emet-blue text-white text-[13px] font-semibold disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <Search className="h-4 w-4 inline mr-2" />}
              getClientReport
            </button>
            <button
              type="button"
              onClick={() => call(
                'checkActivities',
                () => callOneC('checkActivities', {
                  login: user.login,
                  period: currentPeriod.month?.slice(0, 7) ?? '',
                  clientIds: clientId.trim() ? [clientId.trim()] : [],
                }),
              )}
              disabled={loading || !clientId.trim()}
              className="px-4 py-2 rounded-xl bg-amber-500 text-white text-[13px] font-semibold disabled:opacity-50"
            >
              checkActivities (для цього клієнта)
            </button>
          </div>
        </div>

        <div className="glass-card p-4 space-y-3">
          <h2 className="text-[13px] font-bold">3. checkActivities (для перших 5 клієнтів)</h2>
          <p className="text-[11px] text-muted-foreground">Перевір — чи реально 1С повертає `hasCall: true` для тих хто дзвонив у поточному місяці.</p>
          <button
            type="button"
            onClick={async () => {
              await call('checkActivities (first 5)', async () => {
                const list = await callOneC('getManagerClients', { login: user.login });
                const ids = list.clients.slice(0, 5).map(c => c.ClientID).filter(Boolean);
                return await callOneC('checkActivities', {
                  login: user.login,
                  period: currentPeriod.month?.slice(0, 7) ?? '',
                  clientIds: ids,
                });
              });
            }}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-amber-500 text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : <RefreshCw className="h-4 w-4 inline mr-2" />}
            Викликати для перших 5 клієнтів
          </button>
        </div>

        {/* Output */}
        {error && (
          <div className="glass-card p-4 border-l-4 border-rose-500">
            <p className="text-[13px] text-rose-700 font-semibold">Помилка:</p>
            <pre className="text-[11px] text-rose-600 mt-1 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {output !== null && (
          <div className="glass-card p-4">
            <p className="text-[12px] text-muted-foreground mb-2">Raw response:</p>
            <pre className="text-[11px] font-mono bg-white/60 p-3 rounded-xl overflow-auto max-h-[600px] whitespace-pre-wrap break-words">
              {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
