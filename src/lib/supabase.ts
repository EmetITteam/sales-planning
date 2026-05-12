// Supabase REST client без SDK
// Обходить проблему з resolve '@supabase/supabase-js' на Vercel + Next.js 16

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface SupabaseResponse<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

class SupabaseTable {
  private url: string;
  private headers: Record<string, string>;
  private table: string;
  private queryParts: string[] = [];
  private countMode = false;
  private headOnly = false;
  private orderClauses: string[] = [];

  constructor(url: string, headers: Record<string, string>, table: string) {
    this.url = url;
    this.headers = headers;
    this.table = table;
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    this.queryParts.push(`select=${columns}`);
    if (opts?.count) { this.countMode = true; this.headers['Prefer'] = 'count=exact'; }
    if (opts?.head) this.headOnly = true;
    return this;
  }

  // ⚠️ ДВА різні шляхи escape для PostgREST:
  // 1. eq/lt: scalar value → просто encodeURIComponent. Підтримує @ . тощо
  //    у URL. PostgREST парсить decoded значення.
  // 2. in/notIn: list of values, розділених комами → ЯКЩО значення містить
  //    кому або ) або лапку — обернути у "..." з escape \", \\.
  //    Інакше PostgREST вважає кому всередині значення розділювачем →
  //    `in.(00012,00034,evil)` замість `in.("00012,00034",evil)` →
  //    DELETE notIn захопить чужі рядки. Security risk.
  // Раніше була єдина функція що обertala у "..." при крапці — це ламало
  // GET /forecasts?user_id=eq."rm.zp@emet.in.ua" (PostgREST для quoted у
  // eq хоче інший синтаксис). LoadPlanning повертав 0 → save переписував
  // дані з нуля → втрачались зміни менеджера.
  private escapeListValue(v: unknown): string {
    const s = String(v ?? '');
    // У списку (in.()) кома — РОЗДІЛЮВАЧ. Якщо value її має — quoted.
    if (/[,()"\\]/.test(s)) {
      return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return encodeURIComponent(s);
  }

  eq(column: string, value: string | number | boolean): this {
    this.queryParts.push(`${column}=eq.${encodeURIComponent(String(value))}`);
    return this;
  }
  lt(column: string, value: string): this {
    this.queryParts.push(`${column}=lt.${encodeURIComponent(String(value))}`);
    return this;
  }
  in(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.queryParts.push(`${column}=in.()`);
      return this;
    }
    const escaped = values.map(v => this.escapeListValue(v)).join(',');
    this.queryParts.push(`${column}=in.(${escaped})`);
    return this;
  }
  notIn(column: string, values: unknown[]): this {
    if (values.length === 0) {
      return this;
    }
    const escaped = values.map(v => this.escapeListValue(v)).join(',');
    this.queryParts.push(`${column}=not.in.(${escaped})`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderClauses.push(`${column}.${opts?.ascending === false ? 'desc' : 'asc'}`);
    return this;
  }

  single(): Promise<SupabaseResponse<Record<string, unknown>>> {
    this.headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this._execute() as Promise<SupabaseResponse<Record<string, unknown>>>;
  }

  private _method = 'GET';
  private _body: unknown = undefined;
  private _extraHeaders: Record<string, string> = {};

  insert(rows: Record<string, unknown>[]): this {
    this._method = 'POST';
    this._body = rows;
    return this;
  }

  upsert(
    row: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this._method = 'POST';
    // PostgREST приймає масив для batch upsert. Один запит замість N — критично
    // для save planning з 25-40 рядками (інакше save = 4с замість ~200мс).
    this._body = Array.isArray(row) ? row : [row];
    // ignoreDuplicates:true → ON CONFLICT DO NOTHING (для snapshot fix-once семантики).
    // За замовчуванням — merge-duplicates (UPDATE on conflict).
    this._extraHeaders['Prefer'] = opts?.ignoreDuplicates
      ? 'resolution=ignore-duplicates'
      : 'resolution=merge-duplicates';
    if (opts?.onConflict) this.queryParts.push(`on_conflict=${opts.onConflict}`);
    return this;
  }

  delete(): this {
    this._method = 'DELETE';
    return this;
  }

  // Дозволяє деструктуризацію: const { data, error } = await supabase.from('x').select('*').eq(...)
  then<TResult>(
    resolve: (value: SupabaseResponse<Record<string, unknown>[]>) => TResult,
    reject?: (reason: unknown) => TResult
  ): Promise<TResult> {
    return (this._execute() as Promise<SupabaseResponse<Record<string, unknown>[]>>).then(resolve, reject);
  }

  private _execute(): Promise<SupabaseResponse<unknown>> {
    return this._fetchRaw(this._method, { ...this.headers, ...this._extraHeaders }, this._body);
  }

  private async _fetch(method: string, body?: unknown): Promise<SupabaseResponse<unknown>> {
    return this._fetchRaw(method, this.headers, body);
  }

  private async _fetchRaw(method: string, headers: Record<string, string>, body?: unknown): Promise<SupabaseResponse<unknown>> {
    const orderStr = this.orderClauses.length ? `&order=${this.orderClauses.join(',')}` : '';
    const qs = this.queryParts.join('&');
    const url = `${this.url}/rest/v1/${this.table}?${qs}${orderStr}`;

    try {
      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      const countHeader = res.headers.get('content-range');
      const count = countHeader ? parseInt(countHeader.split('/')[1], 10) : null;

      if (this.headOnly) return { data: null, error: null, count };

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let err: { message?: string; details?: string; hint?: string; code?: string } = {};
        try { err = JSON.parse(text); } catch { /* not JSON */ }
        const parts = [
          `HTTP ${res.status}`,
          err.message,
          err.code && `[${err.code}]`,
          err.details,
          err.hint,
          !err.message && text && text.slice(0, 200),
        ].filter(Boolean);
        return { data: null, error: { message: parts.join(' | ') || `HTTP ${res.status} ${res.statusText || '(no body)'}` } };
      }

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return { data, error: null, count };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }
}

class SupabaseClient {
  private url: string;
  private headers: Record<string, string>;

  constructor(url: string, key: string) {
    this.url = url;
    this.headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
    };
  }

  from(table: string): SupabaseTable {
    return new SupabaseTable(this.url, { ...this.headers }, table);
  }
}

export const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_KEY);
