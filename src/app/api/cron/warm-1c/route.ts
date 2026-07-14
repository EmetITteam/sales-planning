import type { NextRequest } from 'next/server';
import { callOneCServer } from '@/lib/onec-server';
import { DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';

/**
 * GET /api/cron/warm-1c — прогрів 1С HTTP-сервісу (Vercel cron).
 *
 * Проблема: після кількох хвилин простою 1С-сервіс «холодний» — перший живий
 * запит менеджера відпрацьовує 5–20с (звідси cold-start retry у useOneCData і
 * скарги «не з першого разу прогружається»).
 *
 * Рішення: раз на 5 хв у робочі години робимо лёгкий read (getRegistryPlans
 * поточного місяця, scoped на director-логін — той самий шлях, що вантажать
 * дашборди), щоб тримати app-pool/infobase теплим. Результат не використовуємо
 * — важливий сам round-trip.
 *
 * Розклад — у vercel.json (`*​/5 * * * *`). Off-hours пропускаємо у хендлері.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: 'CRON_SECRET env not configured' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Прогріваємо лише у робочі години Києва (≈7:00–21:00 = 4:00–18:00 UTC) —
  // вночі сенсу нема, не навантажуємо 1С даремно.
  const utcHour = new Date().getUTCHours();
  if (utcHour < 4 || utcHour >= 18) {
    return Response.json({ skipped: 'off-hours', utcHour });
  }

  // Діапазон = поточний місяць (той самий, що дашборди).
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const mm = String(m).padStart(2, '0');
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateFrom = `${y}-${mm}-01`;
  const dateTo = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const started = Date.now();
  const res = await callOneCServer(
    'getRegistryPlans',
    { dateFrom, dateTo, login: DIRECTOR_PROXY_LOGIN },
    { timeoutMs: 25_000 },
  );
  const durationMs = Date.now() - started;

  // Логуємо тривалість — видно у Vercel logs, чи справді тепле (маленька
  // тривалість = warm; велика = був cold-start, наступний користувач би чекав).
  console.log(`[warm-1c] ok=${res.ok} ${durationMs}ms${res.ok ? '' : ` err=${res.errorMessage}`}`);

  return Response.json({
    warmed: res.ok,
    durationMs,
    error: res.ok ? undefined : res.errorMessage,
  });
}
