/**
 * Замітки Тижневого звіту (weekly_report_notes) — append-only, понедельно.
 * Server-side (service_role). Остання версія = max(created_at) по
 * (region_code, segment_code, week_key, field).
 */
import { supabase } from './supabase';

export type NoteField = 'action' | 'reason' | 'conclusion' | 'promise_check' | 'proposal';

export interface WeeklyNote {
  id: string;
  region_code: string;
  segment_code: string | null;
  week_key: string;
  field: NoteField;
  text: string;
  done: boolean | null;
  author_login: string;
  created_at: string;
}

/** Усі замітки регіону за тиждень (звіт вантажить одним запитом, latest — на клієнті). */
export async function readNotes(regionCode: string, weekKey: string): Promise<WeeklyNote[]> {
  const { data, error } = await supabase.from('weekly_report_notes')
    .select('id,region_code,segment_code,week_key,field,text,done,author_login,created_at')
    .eq('region_code', regionCode)
    .eq('week_key', weekKey)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`readNotes: ${error.message}`);
  return (data ?? []) as unknown as WeeklyNote[];
}

/** Усі замітки ВСІХ регіонів за тиждень (для зведеного звіту РОП — один запит). */
export async function readWeekNotes(weekKey: string): Promise<WeeklyNote[]> {
  const { data, error } = await supabase.from('weekly_report_notes')
    .select('id,region_code,segment_code,week_key,field,text,done,author_login,created_at')
    .eq('week_key', weekKey)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`readWeekNotes: ${error.message}`);
  return (data ?? []) as unknown as WeeklyNote[];
}

/** Додає нову версію замітки (append-only). */
export async function insertNote(row: {
  region_code: string; segment_code: string | null; week_key: string;
  field: NoteField; text: string; done?: boolean | null; author_login: string;
}): Promise<WeeklyNote> {
  const { data, error } = await supabase.from('weekly_report_notes').insert([{
    region_code: row.region_code,
    segment_code: row.segment_code,
    week_key: row.week_key,
    field: row.field,
    text: row.text,
    done: row.done ?? null,
    author_login: row.author_login,
  }]);
  if (error) throw new Error(`insertNote: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data) as unknown as WeeklyNote;
}
