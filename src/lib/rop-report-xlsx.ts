/**
 * Побудова xlsx-книги Зведеного звіту РОП (Лист 4) у стилі EMET.
 * Чиста функція: RopReport → ExcelJS.Workbook (без HTTP/БД) — тестується мок-об'єктом.
 *
 * Стиль EMET: Cambria скрізь, темно-синій заголовок, світло-синя шапка таблиці,
 * зебра, тонкі бордюри, статус-заливки (зелений/жовтий/червоний), приховані лінії
 * сітки, заморожена шапка. Це УПРАВЛІНСЬКИЙ звіт → аркуш «Методологія» не потрібен.
 */
import ExcelJS from 'exceljs';
import type { RopReport } from '@/lib/use-rop-report';
import type { StatusTone } from '@/lib/status-badge';
import type { PlanState } from '@/lib/rop-report-aggregate';

// ── Палітра EMET (ARGB, FF-альфа-префікс) ────────────────────────────────────
const C = {
  TITLE: 'FF1F4E79',
  SECTION: 'FF2E75B6',
  HEAD: 'FFBDD7EE',
  ZEBRA: 'FFFAFAFA',
  BORDER: 'FFBFBFBF',
  WHITE: 'FFFFFFFF',
  HEADTEXT: 'FF1F4E79',
  GREY: 'FF808080',
  OK: 'FFC6EFCE',   // В ПЛАНІ (зелений)
  WARN: 'FFFFEB9C',  // РИЗИК (жовтий)
  BAD: 'FFFFC7CE',   // ВІДСТАВАННЯ (червоний)
} as const;

const FONT = 'Cambria';
const thinB = { style: 'thin' as const, color: { argb: C.BORDER } };
const BORDER = { top: thinB, left: thinB, bottom: thinB, right: thinB };

const toneFill: Record<StatusTone, string> = { ok: C.OK, warn: C.WARN, bad: C.BAD };
const planStateFill: Record<PlanState, string> = { in_time: C.OK, draft: C.WARN, late: C.BAD, not_started: C.BAD };
const planStateLabel: Record<PlanState, string> = {
  in_time: 'в термін', draft: 'чернетка', late: 'прострочено', not_started: 'не розпочато',
};

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** Головний аркуш: hero + 4.1 + 4.2 + 4.4 + 4.5. */
function buildMainSheet(wb: ExcelJS.Workbook, d: RopReport): void {
  const ws = wb.addWorksheet('Зведений звіт', { views: [{ showGridLines: false }] });
  const NCOL = 6;
  const widths = [26, 13, 16, 22, 22, 30];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let row = 1;
  const wk = `${d.week.slice(8)}.${d.week.slice(5, 7)}`;

  // ── Заголовок ──
  ws.mergeCells(row, 1, row, NCOL);
  const title = ws.getCell(row, 1);
  title.value = `ЗВЕДЕНИЙ ЗВІТ РОП — ${d.period} · тиждень ${wk}`;
  title.fill = fill(C.TITLE);
  title.font = { name: FONT, bold: true, size: 13, color: { argb: C.WHITE } };
  title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(row).height = 26;
  row++;

  // ── Підзаголовок ──
  ws.mergeCells(row, 1, row, NCOL);
  const sub = ws.getCell(row, 1);
  sub.value = `звіт → ${d.recipients.report} · наростаючим підсумком · подання щовівторка до 10:00`;
  sub.font = { name: FONT, italic: true, size: 9, color: { argb: C.GREY } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  row++;
  row++; // порожній

  // ── helpers ──
  const sectionHeader = (text: string) => {
    ws.mergeCells(row, 1, row, NCOL);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.fill = fill(C.SECTION);
    c.font = { name: FONT, bold: true, size: 11, color: { argb: C.WHITE } };
    c.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(row).height = 20;
    row++;
  };

  const styleHead = (cols: Array<{ col: number; text: string; mergeTo?: number }>) => {
    for (const c of cols) {
      if (c.mergeTo && c.mergeTo > c.col) ws.mergeCells(row, c.col, row, c.mergeTo);
      const cell = ws.getCell(row, c.col);
      cell.value = c.text;
      cell.fill = fill(C.HEAD);
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.HEADTEXT } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = BORDER;
    }
    ws.getRow(row).height = 30;
    row++;
  };

  const mutedRow = (text: string) => {
    ws.mergeCells(row, 1, row, NCOL);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: FONT, italic: true, size: 10, color: { argb: C.GREY } };
    c.alignment = { horizontal: 'left', vertical: 'middle' };
    c.border = BORDER;
    row++;
  };

  // ── Hero: labeled rows (label A:C merged, value D:F merged) ──
  sectionHeader('Ключові показники');
  const heroRows: Array<{ label: string; value: string | number; fmt?: string }> = [
    { label: 'Виконання представництв (факт / план)', value: d.hero.companyPct, fmt: '0.0"%"' },
    { label: 'Темп прогнозу (на кінець місяця)', value: d.hero.companyForecastPct, fmt: '0.0"%"' },
    { label: 'Норма на дату', value: d.hero.norm, fmt: '0.0"%"' },
    { label: 'Регіони: в плані / ризик / відставання', value: `${d.hero.regionsByTone.ok} / ${d.hero.regionsByTone.warn} / ${d.hero.regionsByTone.bad}` },
    { label: 'План узгоджено в термін', value: `${d.hero.planAgreedInTime} з ${d.hero.planTotal}` },
    { label: 'Обіцянки виконано', value: `${d.hero.promisesDone} з ${d.hero.promisesTotal}` },
    { label: 'План / факт компанії, $', value: `${d.hero.companyPlan.toLocaleString('en-US')} / ${d.hero.companyFact.toLocaleString('en-US')}` },
  ];
  heroRows.forEach((h, i) => {
    ws.mergeCells(row, 1, row, 3);
    ws.mergeCells(row, 4, row, NCOL);
    const lab = ws.getCell(row, 1);
    lab.value = h.label;
    lab.font = { name: FONT, size: 10, color: { argb: C.HEADTEXT } };
    lab.alignment = { horizontal: 'left', vertical: 'middle' };
    lab.border = BORDER;
    const val = ws.getCell(row, 4);
    val.value = h.value;
    val.font = { name: FONT, bold: true, size: 10 };
    val.alignment = { horizontal: 'left', vertical: 'middle' };
    val.border = BORDER;
    if (h.fmt) val.numFmt = h.fmt;
    if (i % 2 === 1) { lab.fill = fill(C.ZEBRA); val.fill = fill(C.ZEBRA); }
    row++;
  });
  row++; // порожній

  // ── 4.1 Зведена таблиця по регіонах ──
  sectionHeader('4.1 Зведена таблиця по регіонах');
  styleHead([
    { col: 1, text: 'Регіон' },
    { col: 2, text: '% на дату' },
    { col: 3, text: 'Мітка' },
    { col: 4, text: 'Червоні бренди', mergeTo: 5 },
    { col: 6, text: 'Обіцянка → факт' },
  ]);
  const freezeAt = row; // заморозимо перед першим рядком 4.1
  d.regions.forEach((r, i) => {
    const zebra = i % 2 === 1;
    const set = (col: number, val: ExcelJS.CellValue, opts?: { fmt?: string; fillArgb?: string; align?: 'left' | 'center' }) => {
      const c = ws.getCell(row, col);
      c.value = val;
      c.font = { name: FONT, size: 10 };
      c.alignment = { horizontal: opts?.align ?? 'left', vertical: 'middle', wrapText: true };
      c.border = BORDER;
      if (opts?.fmt) c.numFmt = opts.fmt;
      if (opts?.fillArgb) c.fill = fill(opts.fillArgb);
      else if (zebra) c.fill = fill(C.ZEBRA);
      return c;
    };
    set(1, r.name);
    set(2, r.pct, { fmt: '0.0"%"', align: 'center' });
    const badge = set(3, r.badge.label, { fillArgb: toneFill[r.badge.tone], align: 'center' });
    badge.font = { name: FONT, size: 10, bold: true };
    ws.mergeCells(row, 4, row, 5);
    set(4, r.redBrands.length ? r.redBrands.join(', ') : '—');
    ws.getCell(row, 5).border = BORDER;
    if (zebra) ws.getCell(row, 5).fill = fill(C.ZEBRA);
    const promiseTxt = r.promise.total > 0
      ? `${r.promise.doneCount}/${r.promise.total} ${r.promise.status === 'no' ? '(є невиконані)' : r.promise.status === 'yes' ? '✓' : ''}`.trim()
      : '—';
    set(6, promiseTxt);
    row++;
  });
  ws.views = [{ state: 'frozen', ySplit: freezeAt - 1, showGridLines: false }];
  row++; // порожній

  // ── 4.2 Червоні зони по брендах ──
  sectionHeader('4.2 Червоні зони по брендах');
  styleHead([
    { col: 1, text: 'Бренд' },
    { col: 2, text: 'К-сть регіонів' },
    { col: 3, text: 'Регіони (%)', mergeTo: 5 },
    { col: 6, text: 'Ескалація' },
  ]);
  if (d.redZones.length === 0) {
    mutedRow('немає червоних зон за період');
  } else {
    d.redZones.forEach((z, i) => {
      const zebra = i % 2 === 1;
      const bg = zebra ? C.ZEBRA : null;
      const put = (col: number, val: ExcelJS.CellValue, align: 'left' | 'center' = 'left', fmt?: string) => {
        const c = ws.getCell(row, col);
        c.value = val;
        c.font = { name: FONT, size: 10 };
        c.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
        c.border = BORDER;
        if (fmt) c.numFmt = fmt;
        if (bg) c.fill = fill(bg);
      };
      put(1, z.brand);
      put(2, `${z.count} / 8`, 'center');
      ws.mergeCells(row, 3, row, 5);
      put(3, z.regions.map(rr => `${rr.region} (${rr.forecastPct.toFixed(0)}%)`).join(', '));
      ws.getCell(row, 4).border = BORDER; ws.getCell(row, 5).border = BORDER;
      if (bg) { ws.getCell(row, 4).fill = fill(bg); ws.getCell(row, 5).fill = fill(bg); }
      const esc = ws.getCell(row, 6);
      esc.value = z.escalate ? `→ ${d.recipients.escalation}` : '—';
      esc.font = { name: FONT, size: 10, bold: z.escalate };
      esc.alignment = { horizontal: 'center', vertical: 'middle' };
      esc.border = BORDER;
      if (z.escalate) esc.fill = fill(C.BAD);
      else if (bg) esc.fill = fill(bg);
      row++;
    });
  }
  row++; // порожній

  // ── 4.4 Підсумки планування ──
  sectionHeader('4.4 Підсумки планування');
  styleHead([
    { col: 1, text: 'Регіон' },
    { col: 2, text: 'Статус', mergeTo: 3 },
    { col: 4, text: 'Причина затримки', mergeTo: 6 },
  ]);
  d.regions.forEach((r, i) => {
    const zebra = i % 2 === 1;
    const bg = zebra ? C.ZEBRA : null;
    const nameC = ws.getCell(row, 1);
    nameC.value = r.name;
    nameC.font = { name: FONT, size: 10 };
    nameC.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    nameC.border = BORDER;
    if (bg) nameC.fill = fill(bg);
    ws.mergeCells(row, 2, row, 3);
    const statusC = ws.getCell(row, 2);
    const late = r.plan.state === 'late' && r.plan.overdueWorkingDays > 0;
    statusC.value = late ? `прострочено +${r.plan.overdueWorkingDays} дн` : planStateLabel[r.plan.state];
    statusC.font = { name: FONT, size: 10, bold: true };
    statusC.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    statusC.border = BORDER;
    statusC.fill = fill(planStateFill[r.plan.state]);
    ws.getCell(row, 3).border = BORDER;
    ws.getCell(row, 3).fill = fill(planStateFill[r.plan.state]);
    ws.mergeCells(row, 4, row, 6);
    const reasonC = ws.getCell(row, 4);
    reasonC.value = r.plan.lateReason || '—';
    reasonC.font = { name: FONT, size: 10 };
    reasonC.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    reasonC.border = BORDER;
    if (bg) reasonC.fill = fill(bg);
    ws.getCell(row, 5).border = BORDER; ws.getCell(row, 6).border = BORDER;
    if (bg) { ws.getCell(row, 5).fill = fill(bg); ws.getCell(row, 6).fill = fill(bg); }
    row++;
  });
  row++; // порожній

  // ── 4.5 Ринкові сигнали ──
  sectionHeader('4.5 Ринкові сигнали');
  const signals: Array<{ label: string; text: string }> = [
    { label: 'Причини невиконання по ТМ', text: d.marketNotes.failures },
    { label: 'Драйвери виконання по ТМ', text: d.marketNotes.drivers },
    { label: 'Інші сигнали ринку', text: d.marketNotes.other },
  ];
  for (const s of signals) {
    ws.mergeCells(row, 1, row, NCOL);
    const lab = ws.getCell(row, 1);
    lab.value = s.label;
    lab.fill = fill(C.HEAD);
    lab.font = { name: FONT, bold: true, size: 10, color: { argb: C.HEADTEXT } };
    lab.alignment = { horizontal: 'left', vertical: 'middle' };
    lab.border = BORDER;
    row++;
    ws.mergeCells(row, 1, row, NCOL);
    const hasText = !!s.text.trim();
    const txt = ws.getCell(row, 1);
    txt.value = hasText ? s.text.trim() : '—';
    txt.font = hasText
      ? { name: FONT, size: 10 }
      : { name: FONT, size: 10, italic: true, color: { argb: C.GREY } };
    txt.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    txt.border = BORDER;
    ws.getRow(row).height = Math.max(20, Math.min(120, Math.ceil((s.text.trim().length || 1) / 90) * 16));
    row++;
  }
  row++; // порожній

  // ── Футер ──
  ws.mergeCells(row, 1, row, NCOL);
  const foot = ws.getCell(row, 1);
  foot.value = 'Джерело: тижневі звіти РМ (Продажі 1С) · зведення РОП';
  foot.font = { name: FONT, italic: true, size: 9, color: { argb: C.GREY } };
  foot.alignment = { horizontal: 'left', vertical: 'middle' };
}

/** Аркуш 4.3 — реєстр обіцянок (flatten promiseRegister[].promises[]). */
function buildPromisesSheet(wb: ExcelJS.Workbook, d: RopReport): void {
  const ws = wb.addWorksheet('Обіцянки (4.3)', { views: [{ showGridLines: false }] });
  const widths = [22, 16, 24, 40, 12, 34];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  let row = 1;
  ws.mergeCells(row, 1, row, 6);
  const title = ws.getCell(row, 1);
  title.value = `4.3 Реєстр обіцянок — ${d.period}`;
  title.fill = fill(C.TITLE);
  title.font = { name: FONT, bold: true, size: 13, color: { argb: C.WHITE } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(row).height = 26;
  row++;

  const heads = ['Регіон', 'Статус регіону', 'Бренд', 'Обіцянка', 'Виконано', 'Причина'];
  heads.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.fill = fill(C.HEAD);
    c.font = { name: FONT, bold: true, size: 10, color: { argb: C.HEADTEXT } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER;
  });
  ws.getRow(row).height = 30;
  const headRow = row;
  row++;

  const statusLabel: Record<'yes' | 'no' | 'none', string> = { yes: 'виконано', no: 'є невиконані', none: '—' };
  const doneLabel = (v: boolean | null) => (v === true ? 'так' : v === false ? 'ні' : '—');
  const doneFill = (v: boolean | null) => (v === true ? C.OK : v === false ? C.BAD : null);

  const flat: Array<{ region: string; status: 'yes' | 'no' | 'none'; brand: string; promiseText: string; done: boolean | null; reason: string | null }> = [];
  for (const reg of d.promiseRegister) {
    for (const p of reg.promises) {
      flat.push({ region: reg.region, status: reg.status, brand: p.brand, promiseText: p.promiseText, done: p.done, reason: p.reason });
    }
  }

  if (flat.length === 0) {
    ws.mergeCells(row, 1, row, 6);
    const c = ws.getCell(row, 1);
    c.value = 'немає зафіксованих обіцянок за період';
    c.font = { name: FONT, italic: true, size: 10, color: { argb: C.GREY } };
    c.alignment = { horizontal: 'left', vertical: 'middle' };
    c.border = BORDER;
    row++;
  } else {
    flat.forEach((f, i) => {
      const zebra = i % 2 === 1;
      const bg = zebra ? C.ZEBRA : null;
      const cells: Array<{ v: ExcelJS.CellValue; align?: 'left' | 'center'; fillArgb?: string; bold?: boolean }> = [
        { v: f.region },
        { v: statusLabel[f.status], align: 'center' },
        { v: f.brand },
        { v: f.promiseText || '—' },
        { v: doneLabel(f.done), align: 'center', fillArgb: doneFill(f.done) ?? undefined, bold: true },
        { v: f.reason || '—' },
      ];
      cells.forEach((cd, ci) => {
        const c = ws.getCell(row, ci + 1);
        c.value = cd.v;
        c.font = { name: FONT, size: 10, bold: cd.bold };
        c.alignment = { horizontal: cd.align ?? 'left', vertical: 'middle', wrapText: true };
        c.border = BORDER;
        if (cd.fillArgb) c.fill = fill(cd.fillArgb);
        else if (bg) c.fill = fill(bg);
      });
      row++;
    });
  }
  ws.views = [{ state: 'frozen', ySplit: headRow, showGridLines: false }];

  ws.mergeCells(row + 1, 1, row + 1, 6);
  const foot = ws.getCell(row + 1, 1);
  foot.value = 'Джерело: тижневі звіти РМ (Продажі 1С) · зведення РОП';
  foot.font = { name: FONT, italic: true, size: 9, color: { argb: C.GREY } };
}

/** Будує повну книгу Зведеного звіту РОП зі стану RopReport. */
export function buildRopWorkbook(d: RopReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EMET Sales Planning';
  wb.created = new Date();
  buildMainSheet(wb, d);
  buildPromisesSheet(wb, d);
  return wb;
}
