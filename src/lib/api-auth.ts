import { NextRequest } from 'next/server';

// Авторизація API:
//   - same-origin запити (наш фронт → наш /api) → дозволено без ключа.
//     Origin/Referer перевіряється на збіг з нашим деплоєм. Браузер ставить
//     Origin автоматично і JS-код сторінки не може його підмінити.
//   - external запити (curl, postman, сторонні інтеграції) → потрібен
//     `x-api-key` що дорівнює env API_SECRET_KEY.
//   - dev режим (NODE_ENV !== production) → дозволено все без ключа.

// У production обовʼязково мати реальний ключ — інакше fallback `dev-secret-key-change-me`
// дозволив би будь-кому посилати X-API-KEY: dev-secret-key-change-me і обходити auth.
// ⚠️ Перевірка ЛИШЕ при runtime запиту (не на module-load) — інакше Next.js
// build падає на 'Collecting page data' у preview-environment Vercel де
// API_SECRET_KEY часто відсутній (лише prod env його має).
function getApiSecret(): string {
  const key = process.env.API_SECRET_KEY;
  if (process.env.NODE_ENV === 'production' && !key) {
    throw new Error(
      'API_SECRET_KEY env variable is required in production. ' +
      'Set it in Vercel → Settings → Environment Variables.'
    );
  }
  return key || 'dev-secret-key-change-me';
}
const ALLOWED_ORIGINS = [
  'https://sales-planning-lyart.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parseOriginHost(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function validateApiRequest(request: NextRequest): { valid: boolean; error?: string; userId?: number } {
  // 1) Sec-Fetch-Site — найнадійніший спосіб для сучасних браузерів (з 2020).
  // Браузер ВЖЕ позначив звідки запит, JS не може підмінити цей header.
  //   - 'same-origin' / 'same-site' — наш фронт → OK
  //   - 'none' — користувач набрав URL у адресному рядку, закладка, PWA →
  //     OK ТІЛЬКИ для GET/HEAD. Для write-методів (POST/PATCH/PUT/DELETE)
  //     'none' = ризик CSRF: phishing-сторінка може зробити redirect/form
  //     POST з cookie. Тому write з 'none' йдуть на fallback Origin allow-list.
  //   - 'cross-site' — стороній сайт → треба ключ
  // Чому НЕ Origin: для same-origin GET браузери часто НЕ шлють Origin header,
  // тоді fall-through на API key → 401 на наших же сторінках.
  const sfSite = request.headers.get('sec-fetch-site');
  const method = request.method.toUpperCase();
  const isWrite = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
  if (sfSite === 'same-origin' || sfSite === 'same-site') {
    return { valid: true };
  }
  if (sfSite === 'none' && !isWrite) {
    return { valid: true };
  }

  // 2) Fallback для старих браузерів — exact match Origin (через URL parse).
  // `https://sales-planning-lyart.vercel.app.evil.com` НЕ пройде (на відміну
  // від startsWith).
  const origin = request.headers.get('origin');
  if (origin) {
    const parsed = parseOriginHost(origin);
    if (parsed && ALLOWED_ORIGINS.includes(parsed)) {
      return { valid: true };
    }
  }

  // 3) dev — без ключа (origin може бути відсутній у тестах curl)
  if (process.env.NODE_ENV !== 'production') {
    return { valid: true };
  }

  // 4) Зовнішній запит → потрібен ключ
  const authHeader = request.headers.get('x-api-key');
  if (authHeader !== getApiSecret()) {
    return { valid: false, error: 'Unauthorized: invalid API key' };
  }

  return { valid: true };
}

export function validateRequiredParams(
  params: Record<string, string | null>,
  required: string[]
): { valid: boolean; error?: string; parsed: Record<string, number> } {
  const parsed: Record<string, number> = {};

  for (const key of required) {
    const val = params[key];
    if (!val) {
      return { valid: false, error: `Missing required parameter: ${key}`, parsed };
    }
    if (['userId', 'periodId'].includes(key)) {
      const num = parseInt(val, 10);
      if (isNaN(num) || num <= 0) {
        return { valid: false, error: `Invalid parameter ${key}: must be a positive integer`, parsed };
      }
      parsed[key] = num;
    }
  }

  return { valid: true, parsed };
}
