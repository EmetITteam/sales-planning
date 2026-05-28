# 02 · API Design

## `/api/analytics/chat` — головний endpoint

### Request

```typescript
// POST /api/analytics/chat
interface ChatRequest {
  message: string;                 // запит користувача
  conversation_id?: string;        // для багаторазових повідомлень в одному чаті
  history?: Message[];             // попередні повідомлення цього chat
  model_override?: 'sonnet' | 'opus';  // якщо явно треба Opus
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}
```

### Response (SSE streaming)

```
data: {"type":"status","text":"Перевіряю сплячих ESSE..."}\n\n
data: {"type":"text_delta","text":"Беру "}\n\n
data: {"type":"text_delta","text":"ESSE з "}\n\n
data: {"type":"tool_use","tool":"query_sales","input":{...}}\n\n
data: {"type":"tool_result","tool":"query_sales","result":{...}}\n\n
data: {"type":"text_delta","text":"\n\n## ESSE..."}\n\n
data: {"type":"xlsx_link","url":"https://..."}\n\n
data: {"type":"done","usage":{"input_tokens":3200,"output_tokens":850,"cost_usd":0.0224}}\n\n
```

### Implementation outline

```typescript
// src/app/api/analytics/chat/route.ts
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, loadMethodologyContext } from '@/lib/analytics/system-prompt';
import { tools } from '@/lib/analytics/tools';

export const maxDuration = 60;  // Vercel: до 60с
export const runtime = 'nodejs'; // НЕ edge

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const body = await req.json() as ChatRequest;

  // Авторизація — використати існуючий middleware sales-planning
  const user = await getCurrentUser(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const model = body.model_override === 'opus'
    ? process.env.ANTHROPIC_MODEL_HEAVY!
    : process.env.ANTHROPIC_MODEL_DEFAULT!;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: any) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        const runner = anthropic.beta.messages.toolRunner({
          model,
          max_tokens: 8000,
          system: buildSystemPrompt(),
          tools,
          messages: [
            ...(body.history || []),
            {
              role: 'user',
              content: [
                { type: 'text', text: `Методологія:\n${loadMethodologyContext()}`,
                  cache_control: { type: 'ephemeral' } },  // prompt caching!
                { type: 'text', text: body.message },
              ],
            },
          ],
          max_iterations: 10,
          stream: true,
        });

        let inputTokens = 0, outputTokens = 0;

        for await (const messageStream of runner) {
          for await (const event of messageStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send({ type: 'text_delta', text: event.delta.text });
            } else if (event.type === 'message_delta' && event.usage) {
              inputTokens += event.usage.input_tokens ?? 0;
              outputTokens += event.usage.output_tokens ?? 0;
            }
          }
          // Tool calls — обробляються toolRunner-ом автоматично
        }

        const cost = computeCost(model, inputTokens, outputTokens);
        send({ type: 'done', usage: { inputTokens, outputTokens, cost_usd: cost } });

        // Логуємо в analytics_queries
        await logQuery({ user_id: user.id, question: body.message, ... });

      } catch (err: any) {
        send({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

### Prompt caching (ВАЖЛИВО для економії)

Anthropic API підтримує **prompt caching** — текст з `cache_control: { type: 'ephemeral' }` кешується на 5 хвилин. Cache hit = 90% знижка на input tokens.

Кешуємо:
- System prompt (рідко змінюється)
- Methodology bundle (~5K tokens)

Налаштовується на рівні message blocks (див. вище). Для повторних запитів в межах сесії — економимо $0.05+ на запит.

## Tools (Zod-визначені)

### `query_sales`
```typescript
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const querySalesTool = betaZodTool({
  name: 'query_sales',
  description: `Execute a read-only SQL SELECT query on the 'sales' table.
Schema: doc_id, sale_date, client_code, client_name, phone, product, brand, discount, division, segment, manager, qty, sum_usd, is_advertising, is_sachet, is_gift_qty0.
Always use < end_date+1 instead of <= end_date for date ranges.
Apply golden filter when not explicitly asked otherwise: sum_usd >= 5 AND NOT is_advertising AND NOT is_sachet AND client_code != ''.
LIMIT results to <= 5000 rows. Use aggregations.`,
  inputSchema: z.object({
    sql: z.string().describe('PostgreSQL SELECT or WITH query'),
    description: z.string().optional().describe('What this query computes (1 sentence)'),
  }),
  run: async ({ sql }) => {
    return await runSafeSql(sql);
  },
});
```

### `run_python`
```typescript
export const runPythonTool = betaZodTool({
  name: 'run_python',
  description: `Run Python code in sandbox. Available: pandas, numpy, openpyxl, matplotlib.
Use for complex aggregations not easy in SQL, or for generating xlsx files (use export_xlsx instead though).
Input data: pass via 'data' param as JSON, accessible as 'data' variable in code.`,
  inputSchema: z.object({
    code: z.string(),
    data: z.any().optional(),
  }),
  run: async ({ code, data }) => {
    return await runSandboxedPython(code, data);
  },
});
```

Реалізація через Anthropic Code Execution Tool (beta) або через локальний sandbox (наприклад Pyodide на serverless). Для MVP — використовуємо Anthropic's вбудований Code Interpreter.

### `export_xlsx`
```typescript
export const exportXlsxTool = betaZodTool({
  name: 'export_xlsx',
  description: `Generate an Excel file in EMET brand style and upload to Supabase Storage.
Returns a public download URL valid for 7 days.
Use this for any tabular output > 20 rows or when user explicitly asks for xlsx.`,
  inputSchema: z.object({
    filename: z.string(),
    sheets: z.array(z.object({
      name: z.string(),
      title: z.string(),
      subtitle: z.string().optional(),
      columns: z.array(z.object({
        header: z.string(),
        width: z.number().optional(),
        format: z.enum(['#,##0', '$#,##0', '0.0%', '@', 'DD.MM.YYYY']).optional(),
        accent: z.enum(['positive', 'negative']).optional(),
      })),
      rows: z.array(z.array(z.any())),
      totals: z.array(z.any()).optional(),
      footnote: z.string().optional(),
    })),
  }),
  run: async (spec) => {
    return { url: await generateAndUpload(spec) };
  },
});
```

## SQL safety (`src/lib/analytics/sql-runner.ts`)

```typescript
const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER',
  'CREATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'CALL',
];

export async function runSafeSql(sql: string): Promise<{ rows: any[]; rowCount: number }> {
  const normalized = sql.trim().toUpperCase();

  // 1. Must start with SELECT or WITH
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
    throw new Error('Only SELECT and WITH queries allowed');
  }

  // 2. No forbidden keywords (basic regex)
  for (const kw of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(sql)) {
      throw new Error(`Forbidden keyword: ${kw}`);
    }
  }

  // 3. No multiple statements (no `;` followed by non-whitespace)
  if (/;[\s\S]*\S/.test(sql.trim())) {
    throw new Error('Multiple statements not allowed');
  }

  // 4. Execute via service-role Supabase client
  const result = await supabaseAdmin.rpc('execute_select', { sql_query: sql });
  if (result.error) throw new Error(result.error.message);

  return { rows: result.data, rowCount: result.data.length };
}
```

На стороні Postgres — окрема функція з обмеженими правами:
```sql
CREATE OR REPLACE FUNCTION execute_select(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Гарантуємо що це SELECT/WITH (повторна перевірка на стороні DB)
  IF NOT (UPPER(TRIM(sql_query)) LIKE 'SELECT%' OR UPPER(TRIM(sql_query)) LIKE 'WITH%') THEN
    RAISE EXCEPTION 'Only SELECT allowed';
  END IF;

  EXECUTE 'SELECT jsonb_agg(t) FROM (' || sql_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Дозволяємо тільки service-role
REVOKE EXECUTE ON FUNCTION execute_select FROM public;
GRANT EXECUTE ON FUNCTION execute_select TO service_role;
```

## Cost calculation

```typescript
// Ціни на 2026-01 (актуальні — перевірити при імплементації)
const PRICING = {
  'claude-sonnet-4-6': { input: 3, output: 15 },       // $/1M tokens
  'claude-opus-4-7':   { input: 15, output: 75 },
};

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['claude-sonnet-4-6'];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
```

## Helper endpoints (внутрішні)

- `GET /api/analytics/history` — список попередніх запитів користувача
- `GET /api/analytics/history/:id` — відкрити конкретний запит
- `DELETE /api/analytics/history/:id` — видалити (privacy)
- `GET /api/analytics/usage` — статистика витрат користувача за місяць
