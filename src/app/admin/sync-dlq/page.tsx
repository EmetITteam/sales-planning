/**
 * /admin/sync-dlq — Dead Letter Queue для meeting_syncs.
 *
 * Показує всі rows зі status='failed' після MAX_RETRIES (зараз 2). Admin
 * може:
 *  - Retry — reset status='pending', наступний sync спробує знов
 *  - Skip — позначити synced без виклику 1С (визнати втрату)
 *  - Подивитися failure_reason + payload для debug
 *
 * Альтернатива до лазіння у Supabase Studio для оперативного recovery.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { ArrowLeft, AlertTriangle, RefreshCw, SkipForward, Loader2 } from 'lucide-react';

interface FailedRow {
  id: string;
  meeting_id: string | null;
  operation: string;
  status: string;
  failure_reason: string | null;
  retry_count: number;
  onec_response: Record<string, unknown> | null;
  payload_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export default function SyncDlqPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const [rows, setRows] = useState<FailedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'director') {
      router.replace('/');
    }
  }, [user, router]);

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/sync-dlq', { credentials: 'same-origin' });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setRows(body.rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'director')) {
      void fetchRows();
    }
  }, [user]);

  const handleAction = async (id: string, op: 'retry' | 'skip') => {
    setActingId(id);
    try {
      const r = await fetch('/api/admin/sync-dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ op, id }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      // Видалити row з UI — після skip/retry вона вже не failed
      setRows(prev => prev.filter(x => x.id !== id));
    } catch (e) {
      alert(`Помилка: ${(e as Error).message}`);
    } finally {
      setActingId(null);
    }
  };

  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'director') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-5xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> На адмін-панель
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Dead-Letter Queue · зустрічі</h1>
            <p className="text-[12px] text-muted-foreground">
              Sync операції що 1С відмовила {`MAX_RETRIES (2)`} разів. Оператор вирішує: retry або skip.
            </p>
          </div>
          <button
            onClick={fetchRows}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-[12px] font-semibold hover:border-emet-blue hover:text-emet-blue transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Оновити
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700">
            Помилка завантаження: {error}
          </div>
        )}

        {loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-[12px]">Завантажую…</span>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="glass-card p-10 text-center">
            <p className="text-[14px] font-semibold text-emerald-700">Жодних failed sync rows.</p>
            <p className="text-[12px] text-muted-foreground mt-1">Усі зустрічі синхронізовано з 1С.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        {r.operation}
                      </span>
                      <span className="text-[10px] text-slate-500 tabular-nums">
                        {new Date(r.created_at).toLocaleString('uk-UA')}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        retry: <strong>{r.retry_count}</strong>
                      </span>
                    </div>
                    <p className="text-[12px] font-mono text-emet-ink mb-1">
                      sync.id={r.id.slice(0, 8)} · meeting.id={(r.meeting_id ?? '—').slice(0, 8)}
                    </p>
                    {r.failure_reason && (
                      <p className="text-[12px] text-rose-700 break-words">{r.failure_reason}</p>
                    )}
                    <details className="mt-2">
                      <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700">
                        payload + 1С response
                      </summary>
                      <pre className="mt-1 text-[10px] bg-slate-50 p-2 rounded border border-slate-100 overflow-x-auto">
                        {JSON.stringify({ sent: r.payload_snapshot, received: r.onec_response }, null, 2)}
                      </pre>
                    </details>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleAction(r.id, 'retry')}
                      disabled={actingId === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emet-blue text-white text-[12px] font-bold hover:bg-emet-blue-light transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'skip')}
                      disabled={actingId === r.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[12px] font-bold hover:border-rose-400 hover:text-rose-700 transition-colors disabled:opacity-50"
                    >
                      <SkipForward className="h-3 w-3" />
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
