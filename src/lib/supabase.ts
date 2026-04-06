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

  eq(column: string, value: string | number | boolean): this { this.queryParts.push(`${column}=eq.${value}`); return this; }
  lt(column: string, value: string): this { this.queryParts.push(`${column}=lt.${value}`); return this; }
  in(column: string, values: unknown[]): this { this.queryParts.push(`${column}=in.(${values.join(',')})`); return this; }

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

  upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): this {
    this._method = 'POST';
    this._body = [row];
    this._extraHeaders['Prefer'] = 'resolution=merge-duplicates';
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
      const count = countHeader ? parseInt(countHeader.split('/')[1]) : null;

      if (this.headOnly) return { data: null, error: null, count };

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: { message: err.message || res.statusText } };
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
