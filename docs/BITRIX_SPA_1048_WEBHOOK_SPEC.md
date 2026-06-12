# ТЗ для reclamation-app — webhook SPA 1048

Розширення Python webhook handler у `reclamation-app` (Vercel) для подій Bitrix SPA 1048 «Верифікація нового клієнта».

## Bitrix-сторона (Налаштування webhook)

У Bitrix24 → Розробникам → Інші → Вихідні webhook → Додати:

| Параметр | Значення |
|----------|----------|
| Подія | `ONCRMDYNAMICITEMUPDATE` |
| Тип сутності | SPA 1048 (Верифікація нового клієнта) |
| URL обробника | той самий що для рекламацій 1038 — `https://reclamation-app...../api/webhook/bitrix_event` |

## Python webhook handler — що додати

Зараз handler обробляє події 1038 (рекламації). Треба розширити для 1048.

```python
# reclamation-app/api/index.py (або де лежить handler)

# === нові константи на верх файлу ===
SPA_RECLAMATION_ID = 1038
SPA_VERIFICATION_ID = 1048

# Stage mapping для верифікації (з нашого src/lib/client-verifications/types.ts)
VERIFICATION_STAGES = {
    "DT1048_10:NEW": "pending",
    "DT1048_10:PREPARATION": "in_progress",
    "DT1048_10:CLIENT": "clarification",
    "DT1048_10:UC_119I4U": "verified",
    "DT1048_10:UC_OE18M6": "rejected",
    "DT1048_10:SUCCESS": "verified",
    "DT1048_10:FAIL": "rejected",
}

# === нова функція ===
async def handle_verification_event(item_id: int, stage_id: str, comment: str | None):
    """
    Викликаємо для подій ONCRMDYNAMICITEMUPDATE з entityTypeId=1048.
    Шле POST у sales-planning /api/clients/verifications/webhook.
    """
    sp_url = os.environ.get(
        "SP_VERIFICATION_WEBHOOK_URL",
        "https://sales-planning-lyart.vercel.app/api/clients/verifications/webhook"
    )
    secret = os.environ["NOTIFICATIONS_INTERNAL_SECRET"]  # той самий

    payload = {
        "bitrixItemId": item_id,
        "stageId": stage_id,
    }
    if comment:
        payload["comment"] = comment

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(
                sp_url,
                json=payload,
                headers={"X-Internal-Secret": secret},
            )
            r.raise_for_status()
        except Exception as e:
            print(f"[verification webhook] sales-planning POST failed: {e}")
            # Не падаємо — Bitrix буде ретраїти

# === у handler-і подій додаємо роутинг по entityTypeId ===
async def handle_bitrix_event(event_data: dict):
    entity_type_id = int(event_data.get("data", {}).get("FIELDS", {}).get("ENTITY_TYPE_ID", 0))
    item_id = int(event_data.get("data", {}).get("FIELDS", {}).get("ID", 0))

    if entity_type_id == SPA_VERIFICATION_ID:
        # Fetch повну картку щоб отримати stageId
        item = await fetch_bitrix_item(item_id, entity_type_id=SPA_VERIFICATION_ID)
        if not item:
            return
        stage_id = item.get("stageId")
        # comment — опційно з commentary field (якщо КЦ написав)
        comment = None  # TODO: додати fetch коментаря з timeline якщо потрібно
        await handle_verification_event(item_id, stage_id, comment)
        return

    # Існуюча логіка для 1038 (рекламацій) — залишається як є
    if entity_type_id == SPA_RECLAMATION_ID:
        await handle_reclamation_event(event_data)
        return
```

## sales-planning API контракт

Endpoint вже готовий: `POST /api/clients/verifications/webhook`

| Поле | Тип | Опис |
|------|-----|------|
| `bitrixItemId` | number | ID картки у Bitrix SPA 1048 |
| `stageId` | string | новий stage, напр. `DT1048_10:UC_119I4U` |
| `comment` | string \| null | опційно, коментар КЦ при rejected/clarification |

**Headers:** `X-Internal-Secret: <NOTIFICATIONS_INTERNAL_SECRET>` (той самий що для нотифікацій).

**Що робить:**
1. Auth перевірка через `timingSafeEqual`
2. Знаходить запис у БД за `bitrix_item_id`
3. Mapping stage → status
4. Update БД (idempotent — якщо статус не змінився, no-op)
5. Створює нотифікацію для менеджера-ініціатора з типом:
   - `client_verified` — зелений, link на картку клієнта
   - `client_rejected` — червоний, у message — причина
   - `client_clarification` — amber, нагадування подивитись у Bitrix
6. `dedup_key = bitrix:verification:<id>:<status>` (idempotent на стороні notifications)

## Env vars для reclamation-app

Додати у Vercel env (Production + Preview):

| Var | Значення |
|-----|----------|
| `SP_VERIFICATION_WEBHOOK_URL` | (опційно) override URL — за замовч `https://sales-planning-lyart.vercel.app/api/clients/verifications/webhook` |
| `NOTIFICATIONS_INTERNAL_SECRET` | той самий що для нотифікацій рекламацій |

## Тестування

1. У Bitrix створити тестовий item у SPA 1048 вручну → подивитись що приходить event у Python handler (логи Vercel)
2. Перемкнути stage у Bitrix через UI → перевірити що sales-planning отримав POST
3. Подивитись у Supabase `client_verifications.status` — має оновитись
4. Подивитись у Supabase `notifications` — має з'явитись запис з типом `client_verified`/`client_rejected`/`client_clarification`
5. Подивитись у менеджера-ініціатора колокольчик — має блимати з лічильником
