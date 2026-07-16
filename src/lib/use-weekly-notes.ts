'use client';

/**
 * Хук заміток Тижневого звіту (Дія/Причина/Висновок/promise_check).
 * Вантажить усі замітки регіону за тиждень одним запитом, тримає ОСТАННЮ версію
 * по кожному (field, segment). Збереження — append-only POST + оптимістичне
 * оновлення локальної мапи.
 */
import { useCallback, useEffect, useState } from 'react';

export type NoteField = 'action' | 'reason' | 'conclusion' | 'promise_check';

export interface NoteLatest {
  text: string;
  done: boolean | null;
  created_at: string;
  author_login: string;
}

interface RawNote {
  segment_code: string | null;
  field: NoteField;
  text: string;
  done: boolean | null;
  created_at: string;
  author_login: string;
}

const keyOf = (field: string, seg: string | null) => `${field}|${seg ?? ''}`;

export function useWeeklyNotes(regionCode: string | null, weekKey: string | null) {
  const [map, setMap] = useState<Record<string, NoteLatest>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!regionCode || !weekKey) { setMap({}); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weekly-report/notes?region=${encodeURIComponent(regionCode)}&week=${encodeURIComponent(weekKey)}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { notes: [] }))
      .then((d: { notes?: RawNote[] }) => {
        if (cancelled) return;
        const latest: Record<string, NoteLatest> = {};
        // notes відсортовані desc по created_at → перший на ключ = останній.
        for (const n of d.notes ?? []) {
          const k = keyOf(n.field, n.segment_code);
          if (!latest[k]) latest[k] = { text: n.text, done: n.done, created_at: n.created_at, author_login: n.author_login };
        }
        setMap(latest);
      })
      .catch(() => { /* мовчки — покажемо порожньо */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [regionCode, weekKey]);

  const save = useCallback(async (field: NoteField, segmentCode: string | null, text: string, done?: boolean | null): Promise<boolean> => {
    if (!regionCode || !weekKey) return false;
    const res = await fetch('/api/weekly-report/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ region_code: regionCode, segment_code: segmentCode, week_key: weekKey, field, text, done }),
    });
    if (!res.ok) return false;
    setMap(prev => ({ ...prev, [keyOf(field, segmentCode)]: { text, done: done ?? null, created_at: new Date().toISOString(), author_login: '' } }));
    return true;
  }, [regionCode, weekKey]);

  const get = useCallback((field: NoteField, segmentCode: string | null): NoteLatest | undefined => map[keyOf(field, segmentCode)], [map]);

  // Перелік останніх заміток поля (напр. усі «Дія» по брендах) — для чек-листа.
  const list = useCallback((field: NoteField): { segmentCode: string | null; note: NoteLatest }[] => {
    const prefix = `${field}|`;
    return Object.entries(map)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, note]) => ({ segmentCode: k.slice(prefix.length) || null, note }));
  }, [map]);

  return { get, list, save, loading };
}

export type WeeklyNotesApi = ReturnType<typeof useWeeklyNotes>;
