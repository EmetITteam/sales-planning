# Аудити та знахідки

Підсумки аудитів meeting-4.0 + meeting-app + reclamation-app.
Не дублюємо те що є у repo-коді — лише ключове для прийняття архітектурних рішень.

---

## 1. metting-4.0 (прод — обов'язкове ПЗ менеджерів)

**Repo:** `github.com/EmetITteam/metting-4.0`
**Стек:** vanilla JS + Bootstrap 5 + Sentry + Google APIs
**Розмір:** 2783 рядки у одному `index.html` — додаток-monolith
**Хостинг:** Vercel + Node.js proxy у `api/handler.js`

### Що працює (12 функцій)

| # | Функція | 1С action | Стан |
|---|---|---|---|
| 1 | Логін | `login` | Plaintext session у localStorage (XSS-risk) |
| 2 | Дашборд зустрічей + фільтри | `getInitialData` | Aggressive refetch після кожного save |
| 3 | Створення зустрічі | `saveNewMeeting` + Calendar | Працює |
| 4 | Редагування зустрічі | `updateMeeting` | Працює |
| 5 | Start meeting + геолокація | `startMeeting` | 5 болів — див. нижче |
| 6 | Finish meeting + end geo | `updateMeeting` (з endLocationData) | Ті ж проблеми |
| 7 | Reschedule | `updateMeeting` | Нема conflict check |
| 8 | Survey/Anketa | `saveClientSurvey` (JSON-blob) | Дублікат `populateSurveyForm()` + JSON без schema |
| 9 | Client report (multi-tab) | `getClientReport` | Працює, Chart.js leak risk |
| 10 | Clients page | `getManagerClients`, `findClient` | Працює |
| 11 | Add client (з file upload) | `registerNewClient` | File upload не використовується далі |
| 12 | Date range filter | client-side | LitePicker не Bootstrap-themed |

### Болі (визначають ADR-5, ADR-6, ADR-7)

| Біль | Що це | Як вирішуємо |
|---|---|---|
| God-monolith 2783 рядки | Один index.html усе | ADR-5: переписуємо, не міграція |
| Geolocation: 10s timeout, тихий null save, без retry, lat/lon приховані, без manual fallback | UX-біль у полі | ADR-7 (повний пакет покращень) |
| Aggressive refetch після кожного save | Повільно | SWR + incremental update |
| Survey JSON-blob у 1С без schema | Не можна еволюціонувати поля | Versioned schema у нашій БД, у 1С шлемо як зараз для legacy compatibility |
| Google Calendar fire-and-forget | Якщо 1С прошло а Calendar ні → silent loss | Окремий sync-worker з retry + DLQ |
| Дублікат функції `populateSurveyForm()` | Mертвий код, копія 80 рядків | Не переносимо |
| Session у localStorage plain | XSS-ризик | ADR-4: переходимо на JWT cookie (як у sales-planning) |
| Status-normalization lossy («Перенос» → «В работе») | Втрата інформації | Нормалізацію робимо у 1С, не на фронті |

### 1С Actions у meeting-4.0 (переносимо як є — це контракт)

| Action | Payload | Purpose |
|---|---|---|
| `login` | `{login, password}` | Auth → user session metadata |
| `getInitialData` | `{login, startDateString, endDateString}` | Meetings + questions + purposes + categories |
| `saveNewMeeting` | Full meeting object | Create meeting (+ triggers Calendar sync) |
| `updateMeeting` | `{newData, oldData}` | Edit/reschedule/finish (+ Calendar sync) |
| `startMeeting` | `{meetingId, locationData}` | Mark started + record start geo |
| `findClient` | `{searchTerm, managerLogin}` | Global client search |
| `getManagerClients` | `{login}` | Manager's assigned clients |
| `registerNewClient` | `{name, phone, address, education, files}` | Create client |
| `getClientReport` | `{clientID}` | Multi-tab client report |
| `saveClientSurvey` | `{clientID, surveyData}` | Store survey JSON |
| `getAllMeetingsForClient` | `{login, clientID}` | Meetings for specific client |
| `updateMeetingCalendarId` | `{meetingId, calendarEventId}` | Proxy-only, sync Calendar event ID |

---

## 2. meeting-app (WIP — твоя нова версія з заказами)

**Repo:** `github.com/EmetITteam/meeting-app`
**Стек:** той самий vanilla JS + Bootstrap
**Стан:** WIP, не у проді

### Delta vs meeting-4.0

| Delta | Стан |
|---|---|
| Модуляризація: `meetings.js`, `clients.js`, `reports.js`, `dashboard.js`, `orders.js`, `debtors.js` | Working |
| Сторінки `page-orders`, `page-order-detail`, `page-add-order`, `page-debtors` | UI готовий |
| Bottom nav: «Замовлення» + «Дебіторська» | Working |
| PWA skeleton: `manifest.json`, `sw.js` | Не повноцінне offline |
| API token + CORS allowlist | Working |
| Analytics dashboard з role-based mock | Pure mock |

### Orders block — деталі

- **UI ~85% готовий:** список, деталь, форма add/edit з cart, contract picker, delivery options, payment chips, multi-currency UAH/USD
- **Backend 0%:** кнопки роблять `showToast()`, не зберігають
- **Mock data:** `MOCK_ORDERS`, `MOCK_ORDER_CLIENTS`, `MOCK_CATALOG` (6 тест-продуктів)
- **Жодного callApi для заказів — нема жодного 1С action**

### Що беремо у sales-planning

- UX patterns (карти заказів, фільтри, cart UI, contract picker) — як референс
- Data model (Order: `id, number, docType, posted, items[], delivery, payment, multi-currency`)
- Multi-currency логіка форми (з fix re-mark prices при зміні контракту)

**НЕ беремо:** JS-код, mock data, PWA skeleton (відкладено), hardcoded CORS

---

## 3. reclamation-app (для етапу 2B — Bitrix24 + TG)

**Repo:** `github.com/EmetITteam/reclamation-app`
**Стек:** **Python FastAPI** (відрізняється від meeting!) + static HTML
**Розмір:** `api/index.py` 568 рядків + `public/index.html` 1356 рядків
**Хостинг:** Vercel serverless (Python runtime)
**Deps:** fastapi, uvicorn, requests, python-multipart

### Архітектура — без власної БД

Усі дані живуть **у Bitrix24** як SPA (Smart Process Automation) items. reclamation-app — це тонкий шар:

```
Manager UI → reclamation-app (FastAPI) → Bitrix24 REST API
                          ↓
                    Telegram Bot API
```

### Endpoints (9 шт.)

| Endpoint | Що робить | Зовнішній виклик |
|---|---|---|
| `POST /api/login` | Login менеджера | Bitrix `crm.item.list` (managers) |
| `POST /api/submit_claim` | Створити рекламацію | Bitrix `crm.item.add` + TG notify |
| `POST /api/add_comment` | Коментар до заявки | Bitrix `crm.timeline.comment.add` + TG notify |
| `POST /api/get_history` | Список заявок менеджера | Bitrix `crm.item.list` |
| `POST /api/get_claim_details` | Деталі заявки | Bitrix `crm.item.get` |
| `POST /api/get_comments` | Коментарі заявки | Bitrix timeline.comment.list |
| `POST /api/telegram_webhook` | TG-bot updates | Receives TG → posts to Bitrix |
| `POST /api/webhook/status_update` | Bitrix → reclamation-app | Status change sync |
| `POST /api/webhook/bitrix_event` | Bitrix → reclamation-app | General events |

### Інтеграції

- **Bitrix24:** webhook URL `https://bitrix.emet.in.ua/rest/2049/{token}/`. Повний CRUD на claims (SPA entity), timeline comments, IM notifications. Хардкод у коді — варто винести у env.
- **Telegram bot:** `TG_BOT_TOKEN` + `TG_ADMIN_CHAT_ID` з env. Менеджер биндить TG надсилаючи email → бот зберігає `chat_id` у Bitrix custom field. Notifications: створення/коментар. Bidirectional: відповідь у боті → коментар у Bitrix.
- **1С:** **0 викликів** — підтверджено. Це повністю окремий контур від решти EMET-стека.

### User flow

1. Manager логиниться у reclamation-app UI (статичний HTML)
2. Створює заявку → Bitrix додає SPA item → TG-нотифікація адміну + биндженим юзерам
3. Коментує → Bitrix timeline + TG
4. Адмін у Bitrix UI змінює статус → webhook → reclamation-app логує + TG notify
5. Менеджер може відповідати на коментарі через TG-бот (replies → Bitrix timeline)

### Опції інтеграції у sales-planning (етап 2B)

| Опція | Підхід | Effort | Pros | Cons |
|---|---|---|---|---|
| **A.** Embed iframe | reclamation-app у iframe `/reclamations` route | S (1-2д) | Мінімум коду | UX awkward (різний стиль, double-auth) |
| **B.** Thin link | Кнопка «Рекламації» на client card → відкриває reclamation-app у новій вкладці | S (0.5д) | Найшвидше | Менеджер змінює контекст |
| **C.** Full rebuild у Next.js | Переписати на нашій стеці | L (5-7д) | Єдиний UX | Дублювання Bitrix-клієнта; Python expertise зникає |
| **D.** Microservice + widget (recommended) | reclamation-app залишається; додає `GET /api/claims_by_client/{id}` endpoint; sales-planning показує widget на client card з останніми 3 заявками; «дивитися все» → deep-link у reclamation-app | M (2-3д) | Найкраще співвідношення зусиль/UX; зберігає Python + Bitrix expertise | Все ще 2 окремих UI |

**Рекомендована опція D.** Деталі у `docs/PROJECT_PLAN.md` секція «Етап 2B».

### Risks

- **Bitrix webhook URL hardcoded** у коді — security risk + complicates env rotation
- **TG bot token у env** — OK, але потрібен моніторинг доступу
- **Без своєї БД** — будь-який downtime Bitrix = повний downtime reclamation-app. Кешу нема.
- **Python runtime на Vercel** — обмежена холодним стартом; кожен виклик може бути 1-3 сек cold start

---

## 4. Ключові висновки для архітектури

1. **Стеки відрізняються:** sales-planning Next.js, meeting Vanilla JS, reclamation FastAPI. **Не уніфікуємо** — кожен залишається у своєму стеку, інтеграція через API.
2. **Source of truth розгалужений:**
   - Зустрічі, клієнти, замовлення, дебіторка → 1С
   - Рекламації → Bitrix24
   - Зустрічі (буфер) → наш Postgres → 1С
3. **Meeting функціонал переписуємо**, рекламації — **інтегруємо як microservice**, замовлення — **новий код + 1С actions з нуля**.
4. **Геолокація:** ADR-7 повний пакет покращень.
5. **God-components у sales-planning:** рефакторимо у міру торкання (ADR-3).
6. **Безпека:** RLS (ADR-4), JWT-cookie замість localStorage, IDOR closure.
7. **UX-блоки переходять** між зустрічами і `/clients` — пакет shared компонентів (див. `PROJECT_PLAN.md` секція 5).
8. **Sync-status badge** — first-class UI у кожному CRM-екрані (ADR-6).
9. **Calendar sync** виокремлюємо як власний worker з retry+DLQ.

---

## 5. Open questions (потребує підтвердження)

- **п.11 Add Client → file upload** — навіщо файли? Зараз skip, повертаємось коли підійдемо до Add Client UI.
- **Calendar sync depth** — Google Calendar інтеграція з meeting-4.0 використовується активно менеджерами? Якщо так — переносимо повноцінно; якщо рідко — спрощуємо до ICS-export.
- **Survey questions** — чи будемо змінювати структуру опитування у новій версії?
- **Bitrix webhook URL** у reclamation-app — переносимо у env, чи лишаємо хардкод (ризик security)?
- **Reclamation widget на client card** — показувати останні 3 заявки, чи лічильник «активні: N»?

---

_Документ оновлюється при появі нової інформації від 1С-розробника, Bitrix-адміна, чи user-фідбеку._
