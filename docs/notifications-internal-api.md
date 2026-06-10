# Notifications Internal API

Для інтеграції з зовнішніми системами (Python webhook, 1С, інші бекенди), щоб
підставляти сповіщення в колокольчик у шапці sales-planning.

## Endpoint

```
POST https://sales-planning.vercel.app/api/notifications/internal
```

## Auth

Header `X-Internal-Secret: <secret>`.

Значення `<secret>` — у Vercel env `NOTIFICATIONS_INTERNAL_SECRET`. Один shared secret для всіх внутрішніх систем. Без header → 403.

Генерувати:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Body

```json
{
  "userLogin": "sm.dnepr2@emet.in.ua",
  "type": "claim_new_comment",
  "title": "Новий коментар у рекламації #12",
  "message": "Мед-відділ: Уточніть LOT серії, будь ласка.",
  "link": "/claims/12",
  "meta": { "claimId": 12, "commentId": 9876 },
  "dedupKey": "bitrix:claim:12:comment:9876"
}
```

### Поля

| Поле | Тип | Обов'язкове | Опис |
|------|-----|-------------|------|
| `userLogin` | string (email) | ✅ | Кому показати. Має містити `@`. |
| `type` | enum | ✅ | Тип події. Дозволені нижче. |
| `title` | string | ✅ | Заголовок коротко (1 рядок). |
| `message` | string | — | Деталь (1-2 рядки, опціонально). |
| `link` | string | — | Куди клік перенаправить. Наприклад `/claims/12`. |
| `meta` | object | — | Кастомний JSON для майбутньої логіки. |
| `dedupKey` | string | — | Унікальний ID події. Якщо вже існує — POST `success: true, deduplicated: true` (idempotent). |

### Допустимі `type`

| Значення | Опис |
|----------|------|
| `claim_new_comment` | Новий коментар у рекламації |
| `claim_status_changed` | Статус рекламації змінено |
| `meeting_reminder` | Нагадування про зустріч |
| `birthday_today` | День народження клієнта |
| `system` | Системне повідомлення |

## Response

### Успіх

```json
{ "success": true, "id": "uuid-…" }
```

### Дедуплікація (idempotent retry)

```json
{ "success": true, "deduplicated": true }
```

### Помилки

| HTTP | Body | Коли |
|------|------|------|
| 403 | `{ "error": "Forbidden" }` | Невірний secret |
| 400 | `{ "error": "userLogin required (email)" }` | Помилка валідації |
| 500 | `{ "error": "…" }` | DB-помилка |

## Python-приклад (webhook інтеграція з Bitrix24)

```python
import os
import requests

SP_URL = 'https://sales-planning.vercel.app/api/notifications/internal'
SP_SECRET = os.environ['SP_NOTIFICATIONS_SECRET']

def notify_new_comment(manager_login: str, claim_id: int, comment_id: int, message_preview: str):
    payload = {
        'userLogin': manager_login.lower().strip(),
        'type': 'claim_new_comment',
        'title': f'Новий коментар у рекламації #{claim_id}',
        'message': message_preview[:200],
        'link': f'/claims/{claim_id}',
        'meta': {'claimId': claim_id, 'commentId': comment_id},
        'dedupKey': f'bitrix:claim:{claim_id}:comment:{comment_id}',
    }
    r = requests.post(
        SP_URL,
        json=payload,
        headers={'X-Internal-Secret': SP_SECRET},
        timeout=5,
    )
    r.raise_for_status()
```

## Інтеграція з нашим reclamation-app

Існуючий Python webhook (`reclamation-app/api/index.py`) шле email при новому
коментарі. Додати поряд POST на цей endpoint:

```python
# Після email send — також ноть у колокольчик
try:
    notify_new_comment(manager_email, claim_id, comment_id, comment_text)
except Exception as e:
    print(f'[notif] failed: {e}')  # silent, не блокуємо email
```

## Vercel env

Той самий 32-байтний secret треба додати у **обох** Vercel-проектах
з однаковою назвою `SP_NOTIFICATIONS_SECRET`:

| Проект | Змінна | Роль |
|--------|--------|------|
| sales-planning | `SP_NOTIFICATIONS_SECRET` | API перевіряє X-Internal-Secret header |
| reclamation-app | `SP_NOTIFICATIONS_SECRET` | Python webhook шле X-Internal-Secret header |

Production scope обов'язково. Після додавання — redeploy обох проектів.

Backward-compat: sales-planning також приймає стару назву
`NOTIFICATIONS_INTERNAL_SECRET` (якщо вже додана).
