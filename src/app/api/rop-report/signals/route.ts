/**
 * Ринкові сигнали Зведеного звіту РОП (4.5) — CRUD.
 * Доступ: РОП/CSO/strategic/admin (як сам звіт, canViewRopReport).
 *   POST   { period, signal, source?, recipient?, deadline?, priority?, status? } → додати
 *   PATCH  { id, ...patch }                                                       → оновити
 *   DELETE ?id=<uuid>                                                             → видалити
 */
import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { canViewRopReport } from '@/lib/feature-flags';
import {
  addMarketSignal, updateMarketSignal, deleteMarketSignal,
  type SignalInput, type SignalPriority, type SignalStatus,
} from '@/lib/market-signals-store';

const PRIORITIES: SignalPriority[] = ['high', 'medium', 'low'];
const STATUSES: SignalStatus[] = ['new', 'in_progress', 'closed'];

async function guard(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return { error: Response.json({ error: auth.error }, { status: 401 }) };
  const session = await getSession();
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!canViewRopReport(session)) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

/** Нормалізуємо вхідні поля сигналу (обрізаємо, валідуємо enum). */
function parseInput(body: Record<string, unknown>): SignalInput {
  const str = (v: unknown, max: number) => (v == null ? undefined : String(v).slice(0, max));
  const priority = PRIORITIES.includes(body.priority as SignalPriority) ? (body.priority as SignalPriority) : undefined;
  const status = STATUSES.includes(body.status as SignalStatus) ? (body.status as SignalStatus) : undefined;
  const deadline = body.deadline ? String(body.deadline).slice(0, 10) : null;
  return {
    signal: str(body.signal, 1000) ?? '',
    source: str(body.source, 300) ?? null,
    recipient: str(body.recipient, 300) ?? null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline ?? '') ? deadline : null,
    priority,
    status,
  };
}

export async function POST(request: NextRequest) {
  const g = await guard(request);
  if (g.error) return g.error;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const period = String(body?.period ?? '');
  if (!/^\d{4}-\d{2}$/.test(period)) return Response.json({ error: 'period (YYYY-MM) required' }, { status: 400 });
  const input = parseInput(body);
  if (!input.signal.trim()) return Response.json({ error: 'signal required' }, { status: 400 });
  try {
    const row = await addMarketSignal(period, input, g.session!.login);
    return Response.json({ ok: true, signal: row });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const g = await guard(request);
  if (g.error) return g.error;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const id = String(body?.id ?? '');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  const input = parseInput(body);
  // Часткове оновлення: беремо лише передані ключі (signal порожній не пишемо).
  const patch: Partial<SignalInput> = {};
  if ('signal' in body && input.signal.trim()) patch.signal = input.signal;
  if ('source' in body) patch.source = input.source;
  if ('recipient' in body) patch.recipient = input.recipient;
  if ('deadline' in body) patch.deadline = input.deadline;
  if ('priority' in body && input.priority) patch.priority = input.priority;
  if ('status' in body && input.status) patch.status = input.status;
  try {
    await updateMarketSignal(id, patch);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guard(request);
  if (g.error) return g.error;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  try {
    await deleteMarketSignal(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
