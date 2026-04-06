import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { NextRequest } from 'next/server';

// POST — архівація: переміщення в archive_* таблиці + видалення оригіналів
export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });

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

  // 2. Видаляємо оригінали тільки якщо копіювання успішне
  if (errors.length === 0) {
    await supabase.from('forecasts').delete().in('period_id', ids);
    await supabase.from('gap_closures').delete().in('period_id', ids);
    await supabase.from('period_summaries').delete().in('period_id', ids);
    await supabase.from('periods').delete().in('id', ids);
  } else {
    return Response.json({ error: `Архівація не завершена: ${errors.join('; ')}` }, { status: 500 });
  }

  return Response.json({
    success: true,
    message: `Архівовано дані до ${cutoffDate}`,
    archived: { periods: ids.length, forecasts: forecasts?.length ?? 0, gaps: gaps?.length ?? 0, summaries: summaries?.length ?? 0 },
  });
}

// GET — превʼю архівації
export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });

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
