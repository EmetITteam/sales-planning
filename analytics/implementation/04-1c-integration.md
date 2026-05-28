# 04 · Інтеграція з 1С — HTTP Sync

## Мета

1С раз на день шле в `sales-planning` зміни за останню добу (нові продажі + редагування). `sales-planning` синхронізує таблицю `sales` у Supabase.

## Контракт

### Endpoint
`POST /api/sales-sync`

### Headers
```
Content-Type: application/json
Authorization: Bearer {ONEC_SYNC_TOKEN}
```

Токен генерується в `.env`, шерится з програмістами 1С через захищений канал. Зміна — кожні 6 місяців.

### Request body

```typescript
interface SalesSyncRequest {
  sync_type: 'incremental' | 'full';
  date_from: string;   // 'YYYY-MM-DD'
  date_to: string;     // 'YYYY-MM-DD'
  rows: SaleRow[];
}

interface SaleRow {
  doc_id: string;          // 'ЗИН00034345'
  doc_line: number;        // 1, 2, 3 (номер рядка в документі)
  sale_date: string;       // ISO 8601 with timezone, e.g. '2026-05-25T12:42:48+03:00'
  client_code: string;     // '000017247' з лідуючими нулями
  client_name: string;
  phone?: string;
  product: string;
  discount?: string;
  seminar?: string;        // для ELLANSE
  project?: string;        // для ELLANSE
  division: string;
  manager?: string;
  qty: number;             // може бути дробове (0.5 саше) — підтримати
  sum_usd: number;         // може бути від'ємне (повернення)
}
```

### Response

```typescript
interface SalesSyncResponse {
  status: 'ok' | 'partial' | 'error';
  rows_inserted: number;
  rows_updated: number;     // upsert по (doc_id, doc_line)
  rows_skipped: number;     // невалідні
  duration_ms: number;
  errors?: string[];        // якщо partial
}
```

### Логіка upsert

```sql
INSERT INTO sales (...)
VALUES (...)
ON CONFLICT (doc_id, doc_line)
DO UPDATE SET
  sale_date = EXCLUDED.sale_date,
  client_name = EXCLUDED.client_name,
  qty = EXCLUDED.qty,
  sum_usd = EXCLUDED.sum_usd,
  synced_at = NOW();
```

## Розклад

- **Cron на стороні 1С:** щодня о 04:00 за київським часом
- Інкремент за останню добу (попередній календарний день + повторне переписування поточного дня — на випадок виправлень)
- При помилці HTTP — retry 3 рази з паузою 30 хв

## Bulk backfill (one-shot)

Один раз при першому запуску:
1. 1С робить вигрузку всіх продажів з 2025-01-01 (повний дамп)
2. Шле в `/api/sales-sync` з `sync_type = 'full'` і батчами по 1000 рядків
3. `sales-planning` запам'ятовує метадані в `sales_sync_log`

Альтернатива: запустити `scripts/backfill_from_tsv.py` з існуючим файлом TSV — як перший заповнювач, потім 1С підхопить інкрементом.

## Що писати програмістам 1С

Спека для них (вклеїти у Telegram / email):

> ## HTTP-сервіс "ВигрузкаПродажВАналітику"
>
> **Endpoint:** `POST https://sales-planning.vercel.app/api/sales-sync`
>
> **Headers:**
> - `Authorization: Bearer ${SECRET}` (отримаєш від мене у Telegram)
> - `Content-Type: application/json`
>
> **Що шлемо:**
> - JSON з масивом `rows` (одна позиція реалізації = один рядок)
> - Поля: див. контракт нижче
>
> **Коли:**
> - Щодня о 04:00 Europe/Kyiv
> - Інкремент за вчора + сьогодні (якщо є виправлення)
>
> **Які накладні брати:**
> - Документ продажу = "Реализация товаров и услуг" (НЕ "Возврат")
> - Усі підрозділи (Київ, Одеса, ... Інтернет-магазин esseskincare, Колл-центр)
> - Усі бренди (без фільтру по номенклатурі)
> - Не виключати "Рекламная продукция" — це робить аналітичний шар
>
> **Особливості:**
> - Дату слати з timezone (+03:00 для Europe/Kyiv)
> - Код контрагента — як рядок, з лідуючими нулями (000017247, не 17247)
> - Суму — у USD (як у звіті продажу)
> - При помилці сервіс відповідає 4xx/5xx — повторити через 30 хв

## Безпека

- ✅ Bearer token у secrets
- ✅ Rate-limit: не більше 100 req/sec на endpoint
- ✅ Body size limit: 50 MB (один запит = ~50K рядків)
- ⚠️ Логуємо в `sales_sync_log` — кожен запит з мета (звідки IP, кількість, статус)

## Мониторинг

В адмінці `sales-planning` — окрема сторінка `/admin/sales-sync-status`:
- Останній sync: дата, кількість рядків, статус
- Графік активності за 30 днів
- Якщо days_behind > 2 — червоний бейдж + email-нотифікація

## Failover

Якщо 1С недоступний > 2 днів:
1. Email нотифікація IT Director
2. AI-аналітик додає у відповідь warning: "⚠️ Останній sync N днів тому — дані можуть бути неактуальні"

## Альтернатива (Phase 2)

Замість HTTP-push з 1С → 1С може зробити **REST-сервіс на читання**, а sales-planning сам поллить його (pull-модель). Плюси:
- Менше залежності від cron'а в 1С
- Простіше дебажити

Але push простіший для MVP — менше коду.

## Тест

Перед production:
1. Програмісти 1С зашлють тестовий батч на 10 рядків
2. Перевіряємо що з'явились в Postgres коректно (особливо коди з нулями, NBSP, дати в +03:00)
3. Запускаємо AI: "перевір що дані прийшли" — має бачити останній день
