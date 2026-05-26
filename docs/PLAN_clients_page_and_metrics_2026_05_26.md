# План: сторінка «Мої клієнти» + нові метрики з Митинга

**Зафіксовано:** 2026-05-26
**Гілка:** glass-redesign → з неї стартуємо нову `feat/clients-page`
**Стейкхолдери:** Користувач (IT Director EMET), Саша (Директор продажу)

---

## 1. Що ми відкрили: 1С actions у meeting-app

Локальний проект `c:\Users\itd\Projects\apps\meeting-app` — це **redesign-копія Митинга 4.0** (production у `meeting-app-production` чіпати не можна). Він використовує **10 існуючих 1С-actions**, які ми МОЖЕМО викликати з sales-planning без жодних змін у 1С.

### 1.1 Список actions

| Action | Параметри | Що повертає | Login-bound |
|---|---|---|---|
| `getManagerClients` | `{login}` | `{clients[]: {ClientID, clientName, ClientCategory, clientAddress, Phone, managerName, isMine}}` | ✅ |
| `findClient` | `{searchTerm, managerLogin}` | `{found, clients[]: {...same+isMine}}` | ✅ (через managerLogin) |
| `getClientReport` | `{clientID}` | `{clientInfo, salesReport.brands[].salesByMonth[], lastMeetings[], lastCalls[], lastSeminars[], yearlySales}` | ❌ |
| `getAllMeetingsForClient` | `{clientID}` | список усіх зустрічей | ❌ |
| `getInitialData` | `{login, startDateString, endDateString}` | `{meetings[], questions[], potentialCategories[], purposes[]}` | ✅ |
| `registerNewClient` | `{name, phone, address, education, managerLogin, files[]}` | write — створення клієнта | ✅ |
| `saveClientSurvey` | survey payload | write | — |
| `startMeeting` / `updateMeeting` / `saveNewMeeting` | meeting payload | write — workflow зустрічей | — |
| `login` | `{login, password}` | session — НЕ використовуємо тут (у нас своя auth) | — |

### 1.2 Деталі найважливіших actions

#### `getClientReport({clientID})` — ⭐ найкорисніший
```ts
{
  clientInfo: {
    id, name, address, category, phone, education, documents (bool)
  },
  salesReport: {
    periodStart, periodEnd,  // 3-міс період
    brands: [{
      brandName,
      totalAmount,
      salesByMonth: [{month: "Травень 2026", amount: 420}, ...]
    }]
  },
  lastMeetings: [{date, comment}],
  lastCalls: [{date, comment}],
  lastSeminars: [{date, comment}],
  yearlySales: ... // тренд за рік
}
```

#### `getManagerClients({login})` — bulk-список клієнтів
```ts
{
  clients: [{
    ClientID, clientName,
    ClientCategory,  // "Новий" | "Активний" | "Сплячий" | "Без закупок" | "Потерянный" | null
    clientAddress, Phone,
    managerName, isMine  // isMine=false означає що клієнт чужий, але потрапив у пошук
  }]
}
```

#### `findClient({searchTerm, managerLogin})` — глобальний пошук
Шукає по всій базі (не лише свої). `isMine:false` для чужих — їх можна показувати read-only.

---

## 2. Що НЕ змінюємо у sales-planning при інтеграції

- ❌ **Не міняємо** 1С-розробникові код. Все вже існує.
- ❌ **Не дублюємо** методи. Просто додаємо у whitelist `/api/onec/route.ts` чотири нові actions: `getManagerClients`, `findClient`, `getClientReport`, `getAllMeetingsForClient`.
- ❌ **Не дублюємо** auth. Наша сесія `sp_session` залишається; усі нові actions проходять через наш login-override (LOGIN_BOUND_ACTIONS додаємо `getManagerClients` + `findClient`).
- ❌ **Не торкаємось** Митинг-репо. Sales-planning — окремий проект. Просто читаємо ті самі 1С endpoint-и.

---

## 3. План: сторінка «Мої клієнти» (v3c → продакшн)

### 3.1 Мокап
`public/clients-view-v3c.html` — фінальний (затверджений 2026-05-26).

Структура:
- **Hero band 4 картки** (MetricCard): План місяця · Факт+сер.чек · Виконали план N/42 · По категоріях (4 рядки списком)
- **Filter pills**: Усі · Активні · Сплячі · Нові · Втрачені · Невиконані→Виконані (sort)
- **4 категорійні секції** (Активні/Сплячі/Нові/Втрачені), у кожній:
  - Невиконані спочатку → divider «—— ВИКОНАЛИ ПЛАН ——» → виконані з тегом «Виконав заплановане»
  - Клієнт-рядок (glass-card з manager-accordion patternом): avatar+name+sub · Факт/План mono · міні-progress-bar · status-pill · chevron expand
  - Розгортання — список брендів: бренд · план · факт · сер. чек · подія (є/нема) · виконання %

### 3.2 Реалізація сторінки
Маршрут: `/clients` (доступ — manager / rm / admin · admin бачить чужих read-only)

API hook: `useClientList()` — паралельно:
- `/api/onec` → `getManagerClients({login})` → список + категорії + телефони
- `/api/onec` → `getRegionData({login, periodId, includeAll:false})` → план/факт по клієнту×бренду цього місяця
- `/api/planning/aggregate?login=...` → finalized forecast+gap з Supabase

Hook `useClientFullProfile(clientID)` (lazy при кліку на рядок):
- `/api/onec` → `getClientReport({clientID})` → 3-міс історія + події + clientInfo

### 3.3 5 пунктів-вимог користувача (затверджено 2026-05-26)
| # | Що | Звідки дані |
|---|---|---|
| 1 | Пошук по контрагенту | `findClient` (global) + client-side filter серед `getManagerClients` |
| 2 | Факт по бренду навіть без плану | `getRegionData` clientStats (вже маємо) |
| 3 | «Потенціал купівлі» (купував 3 міс, цей пусто) | `getClientReport.salesReport.brands.salesByMonth` |
| 4 | Тип події (call/meeting/seminar) | `getClientReport.lastMeetings/lastCalls/lastSeminars` |
| 5 | Тип контрагенту + телефон + освіта | `getClientReport.clientInfo` + `getManagerClients.Phone/ClientCategory` |

---

## 4. Нові метрики для дашбордів (Огляд + РМ + Менеджер)

### 4.1 ТОП-5 пропозицій — найкорисніше

#### № 1 «Холодні клієнти» (last touch > 30 днів)
- **Що**: Картка/блок на РМ-дашборді показує клієнтів які активні в 1С (категорія = Активний), мають план, але **жодного контакту > 30 днів**.
- **Джерело**: `getClientReport.lastMeetings/lastCalls/lastSeminars` — беремо max(date) → diff від сьогодні.
- **Цінність**: Зараз ніде не видно. Менеджер може забути дзвонити постійному клієнту.
- **Вартість**: ~3 год (1 нова картка + bulk-фетч `getClientReport` по top-N клієнтах).

#### № 2 Авто-prefill прогнозу з 3-міс історії ⭐
- **Що**: У формі планування під кожним полем «прогноз» для клієнта × бренду показати «↩ Бер $420 · ↩ Кві $380 · ↩ Тра $400 → пропозиція $400». Кнопка «прийняти» — і прогноз заповнюється.
- **Джерело**: `getClientReport.salesReport.brands.salesByMonth`.
- **Цінність**: Менеджер заповнює прогнози **на 60% швидше**, перестає вгадувати. Зменшується кількість пропущених рядків.
- **Вартість**: ~6 год (UI у формі планування + bulk-фетч історії при відкритті форми).

#### № 3 «Активні + нема контактів»
- **Що**: Менеджерський дашборд — окрема картка «5 клієнтів — план $12K, контактів 0 цього місяця». Drill-down → список.
- **Джерело**: `getAllMeetingsForClient` ∩ поточний місяць + наш plan>0.
- **Цінність**: Раннє попередження що клієнт може не виконати план.
- **Вартість**: ~2 год.

#### № 4 Conversion: дзвінки/зустрічі → продажі
- **Що**: Admin-дашборд — KPI «% клієнтів які купили після дзвінка / після зустрічі» по менеджеру. Допоможе аудити роботи відділу.
- **Джерело**: кореляція дат `lastCalls/lastMeetings` з фактом купівель (Action 5).
- **Цінність**: Корпоративна метрика — об'єктивна якість роботи кожного менеджера.
- **Вартість**: ~5 год.

#### № 5 «Втрата якорного бренду»
- **Що**: Менеджерська/РМ-картка-попередження: «Клієнт N купував Vitaran 3 місяці поспіль і раптом перестав — можлива втрата».
- **Джерело**: `getClientReport.salesReport.brands.salesByMonth` — детект «3 з 3 → 0 цього міс».
- **Цінність**: Раннє виявлення відтоку.
- **Вартість**: ~3 год.

### 4.2 Priority 2 (потім)

| № | Що | Джерело |
|---|---|---|
| 6 | Категорії клієнтів з 1С довідника замість хардкоду | `getInitialData.potentialCategories` |
| 7 | Сегментація по освіті (середній чек дерматолог vs косметолог) | `clientInfo.education` |
| 8 | Suggest «додати у план» (купував мин.міс, нема плану) | `getClientReport.salesReport` |
| 9 | Tap-to-call телефон | `clientInfo.phone` |
| 10 | Графік покупок за рік | `getClientReport.yearlySales` |

### 4.3 Що НЕ дає новий API
- ❌ Дебіторка (моки у Митингу)
- ❌ Замовлення (моки у Митингу)

---

## 5. Порядок робіт — пропозиція

| Етап | Зміст | Вартість | Залежності |
|---|---|---|---|
| **A** | Сторінка `/clients` (v3c → продакшн) | 1 робочий день | whitelist расширення + 4 пункти-вимоги |
| **C** | Авто-prefill прогнозу (#2) у формі планування | ~6 год | bulk-fetch `getClientReport` |
| **B** | Нові картки Огляду/РМ: «Холодні клієнти», «Активні без контактів», «Втрата якорного бренду» (#1, 3, 5) | ~8 год | optional caching щоб не overload 1С |
| **D** | Admin-дашборд conversion-KPI (#4) | ~5 год | новий маршрут /admin/conversion |
| **E** | Priority 2 покращення (#6-10) | по запиту | — |

Discussions for tomorrow:
- ✅ Стартуємо з **A** (сторінка «Мої клієнти»)?
- Гілка `feat/clients-page` від `glass-redesign`
- Перший крок: whitelist у `/api/onec/route.ts` + типи + перший fetch hook

---

## 6. Технічні нотатки для імплементації

### 6.1 Whitelist у `/api/onec/route.ts`
```ts
const ALLOWED_ACTIONS = new Set([
  // existing:
  'getClientsForPlanning', 'getSalesFact', 'getRegistryPlans',
  'getRegionData', 'getTrainings', 'checkActivities',
  // NEW (from Митинг):
  'getManagerClients',     // bulk client list
  'findClient',            // search
  'getClientReport',       // 3-month history + events + clientInfo
  'getAllMeetingsForClient',
]);

const LOGIN_BOUND_ACTIONS = new Set([
  // existing:
  'getClientsForPlanning', 'getSalesFact', 'getRegionData', 'checkActivities',
  // NEW: getManagerClients використовує login, findClient — managerLogin
  'getManagerClients',
  // findClient — окремо обробити (поле managerLogin, не login)
]);
```

Для `findClient` потрібен спеціальний override бо параметр називається `managerLogin` а не `login`. Розширити логіку:
```ts
if (action === 'findClient' && session) {
  safePayload = { ...safePayload, managerLogin: session.login };
}
```

### 6.2 Rate limiting
- Поточний ліміт: 60 req/min, 600 req/hour per session.
- `getClientReport` будемо викликати lazy (тільки при кліку на клієнта), bulk не треба.
- Для bulk-фетчу історії (для авто-prefill) — обмежити до ~30 одночасно або queue.

### 6.3 Cache
- `getManagerClients` — кешувати на 5 хв (SWR `revalidateOnFocus:false`)
- `getClientReport` — кешувати per-clientID на 10 хв
- При фіналізації планування → invalidate `getManagerClients`

### 6.4 Типи (нові у `src/lib/types.ts`)
```ts
export interface ClientFromOneC {
  ClientID: string;
  clientName: string;
  ClientCategory: string | null;
  clientAddress: string;
  Phone: string;
  managerName: string;
  isMine: boolean;
}
export interface ClientReport {
  clientInfo: {
    id: string; name: string; address: string;
    category: string; phone: string;
    education: string; documents: boolean;
  };
  salesReport: {
    periodStart: string; periodEnd: string;
    brands: Array<{
      brandName: string;
      totalAmount: number;
      salesByMonth: Array<{ month: string; amount: number }>;
    }>;
  };
  lastMeetings: Array<{ date: string; comment: string }>;
  lastCalls: Array<{ date: string; comment: string }>;
  lastSeminars: Array<{ date: string; comment: string }>;
  yearlySales?: unknown; // уточнити при першому реальному виклику
}
```

---

## 7. Підсумок

- **Все, що користувач хоче для «Мої клієнти», — досяжно без чіпання 1С-розробника.**
- Митинг 4.0 вже має 10 потрібних actions. Наш `/api/onec` whitelist треба розширити на 4 пункти.
- Найбільший потенційний UX-win **не нова сторінка**, а **авто-prefill прогнозу** з 3-міс історії при плануванні (#2 з пропозицій).
- **Стартуємо завтра з пункту A** — сторінка `/clients`.
