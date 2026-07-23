/**
 * Фіналізація Тижневого звіту (weekly_report_status).
 *
 *   POST   { region_code, week_key }  → фіналізувати (finalized_at=NOW).
 *   DELETE { region_code, week_key }  → пере-відкрити (finalized_at=NULL).
 *   GET    ?region=&week=             → статус одного регіону.
 *   GET    ?week=&all=1               → зведення по всіх регіонах (оверсайт).
 *
 * Доступ (POST/DELETE/GET-регіон): allowedForRegion — РМ свій(і) регіон,
 * admin/director/страт — будь-який. GET-зведення (all=1) — лише seesAllReports.
 *
 * Повноту звіту (усі Дія/Причина/Висновок заповнені) валідує клієнт перед
 * викликом (як і фіналізація плану — сервер лише фіксує факт).
 */
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { allowedForRegion, seesAllReports } from '@/lib/weekly-report-access';
import { finalizeReport, unfinalizeReport, getReportStatus, listWeekStatuses } from '@/lib/weekly-report-status-store';
import { ROP_NOTIFY_LOGIN } from '@/lib/feature-flags';

interface Body { region_code?: string; week_key?: string }

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const week = sp.get('week') || '';
  if (!week) return Response.json({ error: 'week required' }, { status: 400 });

  // Зведення по всіх регіонах — тільки оверсайт-ролі.
  if (sp.get('all') === '1') {
    if (!(await seesAllReports(session))) return Response.json({ error: 'Forbidden' }, { status: 403 });
    try {
      const statuses = await listWeekStatuses(week);
      return Response.json({ statuses });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const region = sp.get('region') || '';
  if (!region) return Response.json({ error: 'region required' }, { status: 400 });
  if (!(await allowedForRegion(session, region))) return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const status = await getReportStatus(region, week);
    return Response.json({ status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Body | null;
  const region = body?.region_code || '';
  const week = body?.week_key || '';
  if (!region || !week) return Response.json({ error: 'region_code + week_key required' }, { status: 400 });
  if (!(await allowedForRegion(session, region))) return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const status = await finalizeReport(region, week, session.login);
    // Нотіф РОПу (Мигашко) у колокольчик — «РМ здав тижневий звіт регіону».
    try {
      await supabase.from('notifications').insert([{
        user_login: ROP_NOTIFY_LOGIN,
        type: 'weekly_report_finalized',
        title: `РМ здав тижневий звіт · ${region}`,
        message: `Регіон ${region} фіналізував тижневий звіт за ${week}.`,
        link: `/weekly-report?region=${region}`,
        meta: { region, week, by: session.login },
      }]);
    } catch (e) {
      console.warn('[weekly-report/finalize] notification insert failed:', (e as Error).message);
    }
    return Response.json({ status });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Body | null;
  const region = body?.region_code || '';
  const week = body?.week_key || '';
  if (!region || !week) return Response.json({ error: 'region_code + week_key required' }, { status: 400 });
  if (!(await allowedForRegion(session, region))) return Response.json({ error: 'Forbidden' }, { status: 403 });
  try {
    await unfinalizeReport(region, week);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
