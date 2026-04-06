import { NextRequest } from 'next/server';

// Тимчасова авторизація API через секретний ключ
// В продакшені замінити на JWT з 1С

const API_SECRET = process.env.API_SECRET_KEY || 'dev-secret-key-change-me';

export function validateApiRequest(request: NextRequest): { valid: boolean; error?: string; userId?: number } {
  // Перевірка API ключа в заголовку
  const authHeader = request.headers.get('x-api-key');

  // В dev/demo режимі — дозволяємо без ключа, але userId з body/params
  if (!authHeader && process.env.NODE_ENV !== 'production') {
    return { valid: true };
  }

  // В production потрібен ключ
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
