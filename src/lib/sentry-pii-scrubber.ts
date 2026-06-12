/**
 * PII scrubber для Sentry — чистить чутливі поля у event перш ніж він
 * піде у Sentry.
 *
 * Чистимо:
 *  - URL query params з email / phone / login / token / password
 *  - request body (POST/PATCH/PUT) — повністю не відправляємо
 *  - breadcrumbs з input value (паролі в input полях)
 *  - user.username / user.email — замінюємо на хеш короткий
 *  - extra/contexts які містять очевидну PII (telephone, email, fullName)
 *
 * Принцип: «менше — краще». Якщо у Sentry прилетить менше контексту —
 * дебажити трохи важче, але GDPR-витоків нема. Стек-трейс + breadcrumbs
 * з URL шляхами лишаються — цього зазвичай досить.
 */

import type { ErrorEvent, EventHint, Breadcrumb } from '@sentry/nextjs';

// Чутливі query параметри що НЕ повинні попасти у Sentry url-and.
const SENSITIVE_PARAMS = new Set([
  'email', 'login', 'username', 'phone', 'tel',
  'password', 'token', 'auth', 'apikey', 'api_key', 'key',
  'secret', 'session', 'cookie', 'fullname', 'full_name', 'name',
  'birthdate', 'birth_date', 'address',
]);

// Чутливі заголовки які треба видалити з request snapshot.
const SENSITIVE_HEADERS = new Set([
  'cookie', 'authorization', 'x-api-key', 'x-internal-secret',
  'set-cookie',
]);

function scrubUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  // navigation/fetch breadcrumbs мають URL — почистимо params
  if (b.data && typeof b.data === 'object') {
    const data: Record<string, unknown> = { ...b.data };
    if (typeof data.url === 'string') data.url = scrubUrl(data.url);
    if (typeof data.to === 'string') data.to = scrubUrl(data.to);
    if (typeof data.from === 'string') data.from = scrubUrl(data.from);
    // ui.input breadcrumbs — Sentry за замовч записує value інпутів.
    // Без цього — пароль з логін-форми летить у Sentry.
    if (b.category === 'ui.input' || b.category === 'ui.click') {
      delete data.message;
      delete data.value;
    }
    return { ...b, data };
  }
  return b;
}

/**
 * Викликається Sentry перед відправкою event. Повертаємо модифікований
 * event, або null щоб відкинути зовсім.
 */
export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // 1. URL у request
  if (event.request) {
    if (typeof event.request.url === 'string') {
      event.request.url = scrubUrl(event.request.url);
    }
    // 2. Прибрати request body повністю — там може бути коментар клієнта,
    // ПІБ, телефон, пароль (POST /api/auth/login).
    delete event.request.data;
    delete event.request.query_string;
    // 3. Заголовки — прибрати ті що несуть auth.
    if (event.request.headers && typeof event.request.headers === 'object') {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(event.request.headers)) {
        if (!SENSITIVE_HEADERS.has(k.toLowerCase())) {
          cleaned[k] = String(v);
        }
      }
      event.request.headers = cleaned;
    }
    // 4. Cookies — повністю.
    delete event.request.cookies;
  }

  // 5. User — лишаємо тільки ID/role, прибираємо email/username/ip.
  if (event.user) {
    event.user = {
      id: event.user.id,
      // Зберігаємо лише role якщо є у data — для фільтрації у Sentry.
      ...(event.user.role ? { role: event.user.role } : {}),
    };
  }

  // 6. Breadcrumbs — почистити url-and ui-input.
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  // 7. extra / contexts — очевидні PII-ключі.
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        event.extra[key] = '[REDACTED]';
      }
    }
  }

  return event;
}
