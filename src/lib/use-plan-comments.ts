'use client';

import useSWR from 'swr';

export interface PlanComment {
  id: number;
  segment_code: string;
  author_login: string;
  author_name: string | null;
  text: string;
  action: 'comment' | 'comment_unfinalize';
  created_at: string;
}

/**
 * Коментарі директора до плану менеджера, згруповані по сегменту (бренду).
 * Один fetch на (менеджер × період) — усі бренди одразу.
 */
export function usePlanComments(
  managerLogin: string | null,
  periodId: number | null,
  month: string | null,
): {
  commentsBySegment: Record<string, PlanComment[]>;
  refetch: () => void;
} {
  const key = managerLogin && periodId ? `plan-comments|${managerLogin}|${periodId}` : null;

  const { data, mutate } = useSWR(
    key,
    async () => {
      const params = new URLSearchParams({ managerLogin: managerLogin!, periodId: String(periodId) });
      if (month) params.set('month', month);
      const r = await fetch(`/api/planning/plan-comment?${params.toString()}`, { credentials: 'same-origin' });
      if (!r.ok) return { comments: [] as PlanComment[] };
      return await r.json() as { comments: PlanComment[] };
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const bySegment: Record<string, PlanComment[]> = {};
  for (const c of data?.comments ?? []) (bySegment[c.segment_code] ??= []).push(c);

  return { commentsBySegment: bySegment, refetch: () => { void mutate(); } };
}
