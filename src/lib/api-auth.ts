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
if (process.env.NODE_ENV === 'production' && !process.env.API_SECRET_KEY) {
  throw new Error(
    'API_SECRET_KEY env variable is required in production. ' +
    'Set it in Vercel → Settings → Environment Variables.'
  );
}
const API_SECRET = process.env.API_SECRET_KEY || 'dev-secret-key-change-me';
const ALLOWED_ORIGINS = [
  'https://sales-planning-lyart.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function validateApiRequest(request: NextRequest): { valid: boolean; error?: string; userId?: number } {
  // 1) same-origin (наш фронт)
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (origin && ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    return { valid: true };
  }

  // 2) dev — без ключа
  if (process.env.NODE_ENV !== 'production') {
    return { valid: true };
  }

  // 3) Зовнішній запит → потрібен ключ
  const authHeader = request.headers.get('x-api-key');
  if (authHeader !== API_SECRET) {
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
