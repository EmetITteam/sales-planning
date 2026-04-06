import { supabase } from '@/lib/supabase';

// POST — архівація даних старше 6 місяців
// Викликається вручну або за cron (Vercel cron / зовнішній)
export async function POST() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

  // Знаходимо періоди старше 6 місяців
  const { data: oldPeriods, error: pErr } = await supabase
    .from('periods')
    .select('id, week_start, week_end')
    .lt('week_end', cutoffDate);

  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
  if (!oldPeriods || oldPeriods.length === 0) {
    return Response.json({ message: 'Немає даних для архівації', archived: 0 });
  }

  const oldPeriodIds = oldPeriods.map(p => p.id);

  // Підрахуємо що видаляємо
  const { count: forecastCount } = await supabase
    .from('forecasts')
    .select('*', { count: 'exact', head: true })
    .in('period_id', oldPeriodIds);

  const { count: gapCount } = await supabase
    .from('gap_closures')
    .select('*', { count: 'exact', head: true })
    .in('period_id', oldPeriodIds);

  const { count: summaryCount } = await supabase
    .from('period_summaries')
    .select('*', { count: 'exact', head: true })
    .in('period_id', oldPeriodIds);

  // Видаляємо в правильному порядку (спочатку дочірні, потім батьківські)
  await supabase.from('forecasts').delete().in('period_id', oldPeriodIds);
  await supabase.from('gap_closures').delete().in('period_id', oldPeriodIds);
  await supabase.from('period_summaries').delete().in('period_id', oldPeriodIds);
  await supabase.from('periods').delete().in('id', oldPeriodIds);

  return Response.json({
    message: `Архівовано дані до ${cutoffDate}`,
    archived: {
      periods: oldPeriods.length,
      forecasts: forecastCount ?? 0,
      gapClosures: gapCount ?? 0,
      summaries: summaryCount ?? 0,
    },
  });
}

// GET — показати що буде архівовано (preview)
export async function GET() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

  const { data: oldPeriods } = await supabase
    .from('periods')
    .select('id, week_start, week_end')
    .lt('week_end', cutoffDate);

  if (!oldPeriods || oldPeriods.length === 0) {
    return Response.json({ message: 'Немає даних для архівації', cutoffDate, periods: 0 });
  }

  const oldPeriodIds = oldPeriods.map(p => p.id);

  const { count: forecastCount } = await supabase
    .from('forecasts')
    .select('*', { count: 'exact', head: true })
    .in('period_id', oldPeriodIds);

  const { count: gapCount } = await supabase
    .from('gap_closures')
    .select('*', { count: 'exact', head: true })
    .in('period_id', oldPeriodIds);

  return Response.json({
    message: `Буде архівовано дані до ${cutoffDate}`,
    cutoffDate,
    periods: oldPeriods.length,
    forecasts: forecastCount ?? 0,
    gapClosures: gapCount ?? 0,
  });
}
