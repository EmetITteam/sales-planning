import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

// POST — архівація: переміщення в archive_* таблиці + видалення оригіналів.
//
// SECURITY: ТІЛЬКИ Director може запускати. Це destructive action на ВСЮ
// компанію, не може бути доступна навіть РМ.
export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'director') {
    return Response.json({ error: 'Forbidden: only director can run archive' }, { status: 403 });
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

  // Знаходимо старі періоди
  const { data: oldPeriods, error: pErr } = await supabase
    .from('periods').select('id').lt('week_end', cutoffDate);

  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
  if (!oldPeriods?.length) return Response.json({ message: 'Немає даних для архівації', archived: 0 });

  const ids = oldPeriods.map(p => p.id);

  // 1. Копіюємо в архівні таблиці
  const { data: forecasts } = await supabase.from('forecasts').select('*').in('period_id', ids);
  const { data: gaps } = await supabase.from('gap_closures').select('*').in('period_id', ids);
  const { data: summaries } = await supabase.from('period_summaries').select('*').in('period_id', ids);

  const errors: string[] = [];

  if (forecasts?.length) {
    const rows = forecasts.map(f => ({ ...f, archived_at: new Date().toISOString() }));
    const { error } = await supabase.from('archive_forecasts').insert(rows);
    if (error) errors.push(`Archive forecasts: ${error.message}`);
  }

  if (gaps?.length) {
    const rows = gaps.map(g => ({ ...g, archived_at: new Date().toISOString() }));
    const { error } = await supabase.from('archive_gap_closures').insert(rows);
    if (error) errors.push(`Archive gaps: ${error.message}`);
  }

  if (summaries?.length) {
    const rows = summaries.map(s => ({ ...s, archived_at: new Date().toISOString() }));
    const { error } = await supabase.from('archive_period_summaries').insert(rows);
    if (error) errors.push(`Archive summaries: ${error.message}`);
  }

  // 2. Якщо архівація провалилась — НЕ видаляємо оригінали (ще можна повторити)
  if (errors.length > 0) {
    console.error('[archive.POST] copy phase failed:', errors);
    return Response.json({ error: `Архівація не завершена: ${errors.join('; ')}` }, { status: 500 });
  }

  // 3. Видалення оригіналів — кожен крок з error-check. Якщо хоч один впав —
  // повертаємо 500 з переліком де bd могла лишитись у inconsistent state.
  // (Архівні таблиці уже мають копію, тому повторний запуск безпечний.)
  const delErrors: string[] = [];
  const { error: e1 } = await supabase.from('forecasts').delete().in('period_id', ids);
  if (e1) delErrors.push(`Delete forecasts: ${e1.message}`);
  const { error: e2 } = await supabase.from('gap_closures').delete().in('period_id', ids);
  if (e2) delErrors.push(`Delete gaps: ${e2.message}`);
  const { error: e3 } = await supabase.from('period_summaries').delete().in('period_id', ids);
  if (e3) delErrors.push(`Delete summaries: ${e3.message}`);
  const { error: e4 } = await supabase.from('periods').delete().in('id', ids);
  if (e4) delErrors.push(`Delete periods: ${e4.message}`);

  if (delErrors.length > 0) {
    console.error('[archive.POST] delete phase failed (data в неузгодженому стані):', delErrors);
    return Response.json({
      error: `Архів створено, але видалення оригіналів частково провалилось: ${delErrors.join('; ')}. Запустіть архівацію повторно.`,
    }, { status: 500 });
  }

  return Response.json({
    success: true,
    message: `Архівовано дані до ${cutoffDate}`,
    archived: { periods: ids.length, forecasts: forecasts?.length ?? 0, gaps: gaps?.length ?? 0, summaries: summaries?.length ?? 0 },
  });
}

// GET — превʼю архівації. Director-only теж — не показуємо statistics стороннім.
export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'director') {
    return Response.json({ error: 'Forbidden: only director' }, { status: 403 });
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

  const { data: oldPeriods } = await supabase.from('periods').select('id').lt('week_end', cutoffDate);
  if (!oldPeriods?.length) return Response.json({ message: 'Немає даних для архівації', cutoffDate, count: 0 });

  const ids = oldPeriods.map(p => p.id);
  const { count: fc } = await supabase.from('forecasts').select('*', { count: 'exact', head: true }).in('period_id', ids);
  const { count: gc } = await supabase.from('gap_closures').select('*', { count: 'exact', head: true }).in('period_id', ids);

  return Response.json({ cutoffDate, periods: ids.length, forecasts: fc ?? 0, gapClosures: gc ?? 0 });
}
