/**
 * In-memory rate limit для Next.js route handlers на Vercel serverless.
 *
 * ⚠️ Обмеження: Vercel запускає кілька function instances одночасно (cold/warm),
 * у кожного власна memory. Тому реальний ліміт ≈ N×limit (де N = кількість
 * активних instances). Для UI-юзерів ~25 менеджерів — достатньо щоб зупинити
 * кричущі скрипти, але НЕ протистоїть свідомий DDoS.
 *
 * Для проду рекомендую upgrade на Upstash Redis (`@upstash/ratelimit`):
 *   - shared state між instances → точний ліміт
 *   - sliding window замість fixed-window
 *   - free tier 10к команд/день — досить для нас
 *
 * Поки що in-memory — нуль зовнішніх залежностей, працює одразу.
 */

interface Bucket {
  /** Timestamps (ms) усіх hit-ів у поточному вікні. */
  hits: number[];
}

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;        // 60 запитів на хвилину на ключ
const MAX_PER_HOUR = 600;         // 600 запитів на годину на ключ
const HOUR_MS = 60 * 60 * 1000;

const buckets = new Map<string, Bucket>();

// Періодична чистка щоб Map не ріс безмежно. Викликається лінійно — кожні
// 100 hit-ів проходимся по Map і викидаємо прострочені ключі.
let opsSinceClean = 0;
function maybeCleanup() {
  if (++opsSinceClean < 100) return;
  opsSinceClean = 0;
  const cutoff = Date.now() - HOUR_MS;
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter(t => t >= cutoff);
    if (b.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Якщо !allowed — скільки секунд чекати до наступної спроби. */
  retryAfterSec?: number;
}

/**
 * Перевірити і інкрементувати ліміт для ключа (login або IP).
 * Повертає {allowed, remaining, retryAfterSec}.
 */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const minuteAgo = now - WINDOW_MS;
  const hourAgo = now - HOUR_MS;

  const bucket = buckets.get(key) ?? { hits: [] };
  // Викидаємо timestamps старіше години.
  bucket.hits = bucket.hits.filter(t => t >= hourAgo);

  const inLastMinute = bucket.hits.filter(t => t >= minuteAgo).length;
  const inLastHour = bucket.hits.length;

  if (inLastMinute >= MAX_PER_WINDOW) {
    const oldest = bucket.hits.find(t => t >= minuteAgo) ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((oldest + WINDOW_MS - now) / 1000),
    };
  }
  if (inLastHour >= MAX_PER_HOUR) {
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((oldest + HOUR_MS - now) / 1000),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  maybeCleanup();
  return {
    allowed: true,
    remaining: MAX_PER_WINDOW - inLastMinute - 1,
  };
}
