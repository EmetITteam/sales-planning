/**
 * Серверний прокі до HTTP-сервісу 1С.
 *
 * Browser → POST /api/onec { action, payload }
 *        → ця route форвардить запит на ONEC_BASE_URL
 *        → 1С повертає { status: 'success' | 'error', data | message }
 *        → передаємо як є назад у браузер
 *
 * Чому прокі (а не fetch напряму з браузера):
 *  1) CORS — 1С зазвичай не дозволяє cross-origin
 *  2) Логування і retry зручно робити на сервері
 *
 * ENV:
 *  - ONEC_BASE_URL (обов'язковий) — наприклад https://1c.emet.com.ua/api/handler
 *  - ONEC_LOGIN / ONEC_PASSWORD (опційні) — Basic Auth якщо HTTP-сервіс
 *    вимагає авторизацію. Якщо 1С налаштований на анонімний доступ —
 *    лишити порожніми, заголовок Authorization не додається.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { DIRECTOR_PROXY_LOGIN, MULTI_REGION_RM_OVERRIDES } from '@/lib/feature-flags';

/**
 * Actions де admin прокситься через DIRECTOR_PROXY_LOGIN бо admin не
 * закріплений у 1С за регіонами/менеджерами — без proxy 1С повертає пусто.
 * Це company-wide actions для DirectorDashboard/CompanyOverview.
 *
 * ВСІ ІНШІ actions admin шле під СВОЇМ логіном — її особисті клієнти/зустрічі.
 * Якщо у 1С нема даних під itd@ → нехай порожнє, admin створює тестові
 * самостійно. Це чисто для перевірки функціоналу.
 */
const ADMIN_PROXY_ACTIONS = new Set([
  'getRegionData',          // регіональна структура компанії
  'getClientsForPlanning',  // план менеджерів
  'getTrainings',           // тренінги менеджерів
]);

// Дозволені 1С actions — whitelist щоб через прокі не можна було звертатись
// до довільних 1С-методів. `login` НЕ дозволений тут — для нього є /api/auth/login
// (там одразу cookie ставиться). Інакше можна було б обходити cookie встановлення.
const ALLOWED_ACTIONS = new Set([
  'getClientsForPlanning',
  'getSalesFact',
  'getRegistryPlans',
  'getRegionData',
  'getTrainings',
  'checkActivities',
  // === Митинг (meeting-app) 1С-actions для CRM-сторінки «Мої клієнти» ===
  // Усі вже існують у 1С production-системі (через Митинг). Тут ми просто
  // дозволяємо проксі на ті самі endpoint-и.
  'getManagerClients',        // bulk список клієнтів менеджера (login-bound)
  'findClient',                // глобальний пошук (managerLogin-bound)
  'getClientReport',           // 3-міс історія + events + clientInfo (clientID)
  'getAllMeetingsForClient',   // всі зустрічі по клієнту (clientID)
  'getClientFocus',            // фокуси по клієнтах bulk (login + clientIds[])
  'getClientActivationPlan',   // план активації бази по категоріях (login + period) — Action B
  'saveClientSurvey',          // зберегти анкету клієнта (з meeting-app outcome flow)
  'getInitialData',            // довідник purposes + meetings за період (meeting-app legacy)
  'registerNewClient',         // створити нового клієнта з документами (meeting-app legacy)
]);

// Action → яке поле у payload.login треба ОВЕРРАЙДНУТИ з сесії.
// Це гарантує що менеджер не може запросити `getClientsForPlanning({login: "boss@emet.com"})`.
const LOGIN_BOUND_ACTIONS = new Set([
  'getClientsForPlanning',
  'getSalesFact',
  'getRegionData',
  'checkActivities',
  'getManagerClients',
  'getClientFocus',  // приймає {login, clientIds} — login ОБОВ'ЯЗКОВО override з сесії
  'getClientActivationPlan',  // приймає {login, period} — login override з сесії
  'getInitialData',  // приймає {login, startDateString, endDateString} — login override
  // === 2026-06-12: IDOR fix coordinated with 1С-розробником ===
  // 1С тепер приймає login і повертає 403 якщо clientID не належить
  // login (для admin/director — bypass). Ми додаємо login з сесії
  // примусово через override-механізм (нижче).
  'getClientReport',           // {clientID} → додаємо login для scope-check на 1С
  'getAllMeetingsForClient',   // {clientID} → те саме
  'getRegistryPlans',          // {dateFrom, dateTo} → manager бачить свої, director/admin усі
  // ⚠️ saveClientSurvey ТИМЧАСОВО ВИКЛЮЧЕНО (2026-06-12 wave 2):
  //    1С-розробник пропустив це action — наш login параметр викликає
  //    "Поле объекта не обнаружено (login)" → менеджери не можуть закрити
  //    зустріч з анкетою. Прибрав з override.
  //    TODO: повернути у whitelist коли 1С додасть підтримку login (як для
  //    getClientReport тощо). Sentry-ішью: «Помилка бізнес-логіки 1С для дії
  //    saveClientSurvey: Поле объекта не обнаружено (login)»
]);

// `findClient` — окремий випадок: поле зветься `managerLogin`, не `login`.
// Робимо такий самий override як у LOGIN_BOUND_ACTIONS — інакше менеджер міг би
// пошукати «як від імені іншого менеджера» і побачити чужий ClientCategory/Phone.
const MANAGER_LOGIN_BOUND_ACTIONS = new Set([
  'findClient',
  'registerNewClient',  // {managerLogin, name, phone, address, education, files} → override managerLogin з сесії
]);

// (історичний коментар до 2026-06-12 IDOR-fix — лишається для контексту)
// `getClientReport` / `getAllMeetingsForClient` приймали `clientID` без login.
// TODO: попросити 1С-розробника додати login у payload і валідувати власника.

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ status: 'error', message: auth.error }, { status: 401 });
  }
  const session = await getSession();
  if (!session) {
    return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit per session.login. Захист від рантонутого скрипта що дамп-ить
  // 1С через прокі. Liміт 60 req/min + 600 req/hour — для UI достатньо
  // (звичайний користувач робить ~5-10 req/min).
  const rl = checkRateLimit(`onec:${session.login}`);
  if (!rl.allowed) {
    return Response.json(
      { status: 'error', message: `Забагато запитів. Спробуйте через ${rl.retryAfterSec}с.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } },
    );
  }

  const baseUrl = process.env.ONEC_BASE_URL;
  const login = process.env.ONEC_LOGIN;
  const password = process.env.ONEC_PASSWORD;

  if (!baseUrl) {
    return Response.json(
      { status: 'error', message: 'Не налаштовано env: потрібно ONEC_BASE_URL' },
      { status: 500 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, payload } = body ?? {};
  if (!action || typeof action !== 'string') {
    return Response.json({ status: 'error', message: 'Missing or invalid action' }, { status: 400 });
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    return Response.json(
      { status: 'error', message: `Action "${action}" не дозволений` },
      { status: 403 },
    );
  }

  // SECURITY: для actions з login-параметром примусово підставляємо логін з сесії
  // або перевіряємо доступ.
  // - Менеджер: тільки свій логін
  // - РМ: свій + managedUsers (менеджери регіону) напряму
  // - Director: будь-хто (закріплений у 1С з повними правами)
  // - Admin (itd@): існує у 1С з повними правами, шле СВІЙ логін для personal
  //   actions (свої клієнти, зустрічі, активності). Для company-wide
  //   ADMIN_PROXY_ACTIONS (getRegionData, getClientsForPlanning, getTrainings) —
  //   proxy через DIRECTOR_PROXY_LOGIN, бо admin не закріплений за регіонами.
  // - Multi-region RM (Пашковська) — як director (будь-який login). Drill-down
  //   у менеджерів іншого регіону, але managedUsers тільки Одеса.
  let safePayload = payload ?? {};
  if (LOGIN_BOUND_ACTIONS.has(action)) {
    const requestedLogin = (safePayload as { login?: string }).login;
    const isAdminOrDirector = session.role === 'admin' || session.role === 'director';
    const sessionLoginLower = session.login.toLowerCase().trim();
    const isMultiRegionRM = !!MULTI_REGION_RM_OVERRIDES[sessionLoginLower];
    const adminNeedsProxy =
      session.role === 'admin'
      && ADMIN_PROXY_ACTIONS.has(action)
      && (!requestedLogin || requestedLogin === session.login);
    if (adminNeedsProxy) {
      safePayload = { ...safePayload, login: DIRECTOR_PROXY_LOGIN };
    } else if (!requestedLogin) {
      safePayload = { ...safePayload, login: session.login };
    } else if (
      requestedLogin !== session.login
      && !session.managedUsers.includes(requestedLogin)
      && !isAdminOrDirector
      && !isMultiRegionRM
    ) {
      return Response.json(
        { status: 'error', message: 'Forbidden: login outside your scope' },
        { status: 403 },
      );
    }
    // SECURITY C1: includeAll=true (Action 5 getRegionData) повертає ВСІ
    // підрозділи компанії включно з тими де менеджер нема. 1С НЕ перевіряє
    // право на цей прапор — гард тут. Тільки admin може його використовувати.
    if ('includeAll' in safePayload && session.role !== 'admin') {
      const { includeAll: _, ...rest } = safePayload as Record<string, unknown>;
      safePayload = rest;
    }
  }

  // findClient: override `managerLogin` (а не `login`) тим самим способом.
  // Менеджер не може шукати «як від імені іншого менеджера».
  // Admin: шукає у СВОЇХ клієнтах під своїм логіном (не proxy). Якщо порожньо —
  // створить тестові через registerNewClient.
  if (MANAGER_LOGIN_BOUND_ACTIONS.has(action)) {
    const requested = (safePayload as { managerLogin?: string }).managerLogin;
    const isAdminOrDirector = session.role === 'admin' || session.role === 'director';
    if (!requested) {
      safePayload = { ...safePayload, managerLogin: session.login };
    } else if (
      requested !== session.login
      && !session.managedUsers.includes(requested)
      && !isAdminOrDirector
    ) {
      return Response.json(
        { status: 'error', message: 'Forbidden: managerLogin outside your scope' },
        { status: 403 },
      );
    }
  }

  const requestBody = JSON.stringify({ action, payload: safePayload });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Basic Auth додаємо тільки якщо обидва env задані
  if (login && password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  // Лог без payload — раніше тут було JSON.stringify(safePayload) що
  // витікало PII (нові клієнти, телефони, ПІБ) у Vercel logs.
  // 2026-06-11 (audit Sprint 2C): прибрано вміст, лишилась лише
  // мітка дії + хто шле. Якщо треба debug payload — увімкнути локально
  // вручну (не комітити).
  console.log(`[ШАГ 1] Відправка в 1С: action="${action}" user="${session.login}"`);

  const callStarted = Date.now();
  try {
    // Server-side timeout — інакше Vercel function висить до killу платформи (~10-60с).
    // Клієнт окремо має свій 15с timeout у onec-client.ts; цей — підстраховка.
    const upstream = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: requestBody,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });

    const text = await upstream.text();
    const callDuration = Date.now() - callStarted;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // У проді не показуємо raw 1С body (може бути IIS stack trace).
      console.error(`[ШАГ 2] Помилка від 1С "${action}" (${callDuration}ms): non-JSON HTTP ${upstream.status}: ${text.slice(0, 200)}`);
      return Response.json(
        {
          status: 'error',
          message: `1С повернула невалідну відповідь (HTTP ${upstream.status}). Спробуйте пізніше.`,
          ...(process.env.NODE_ENV !== 'production' && { debugBody: text.slice(0, 200) }),
        },
        { status: 502 },
      );
    }

    // Success-лог без вмісту відповіді — раніше логували до 1KB JSON
    // включно з даними клієнтів/телефонів. 2026-06-11 (audit Sprint 2C):
    // OK-path лише duration+status, error-path першу частину для debug
    // (помилки 1С зазвичай короткі — message без даних).
    if (upstream.ok && json?.status !== 'error') {
      console.log(`[ШАГ 2] Відповідь від 1С "${action}" OK (${callDuration}ms)`);
    } else {
      const jsonStr = JSON.stringify(json);
      const truncated = jsonStr.length > 400 ? jsonStr.slice(0, 400) + `...(+${jsonStr.length - 400} chars)` : jsonStr;
      console.error(`[ШАГ 2] Помилка від 1С "${action}" (${callDuration}ms, HTTP ${upstream.status}):`, truncated);
    }

    // Передаємо відповідь 1С як є — клієнт сам розбере success/error
    return Response.json(json, { status: upstream.ok ? 200 : upstream.status });
  } catch (err) {
    const callDuration = Date.now() - callStarted;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ШАГ 2] Помилка зв'язку з 1С "${action}" (${callDuration}ms):`, message);
    return Response.json(
      { status: 'error', message: `Помилка зв'язку з 1С: ${message}` },
      { status: 502 },
    );
  }
}
