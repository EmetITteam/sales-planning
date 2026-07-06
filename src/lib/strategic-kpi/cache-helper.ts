/**
 * Cache helper для strategic-kpi агрегацій.
 *
 * Вирішує 3 проблеми з простим Map-based кешем (audit Agent 4):
 *   1. RACE CONDITION при cache miss: два одночасних запити на однаковий
 *      cacheKey запускають два незалежних fetch (100K+ рядків × 2).
 *      Тепер тримаємо Promise у кеші — другий запит чекає перший.
 *   2. CACHE POISONING: Map повертав посилання на масив. `.sort()` у
 *      API-route мутувала кеш. Тепер зберігаємо frozen deep-copy.
 *   3. MEMORY LEAK: Map ріс вічно. Тепер LRU cleanup при size > MAX.
 *
 * Створено 2026-07-02.
 */

interface Entry<T> {
  at: number;
  // Або готовий result (миттєвий cache hit), або in-flight Promise.
  ready?: T;
  pending?: Promise<T>;
}

const MAX_ENTRIES = 200;   // LRU cap на один інстанс кешу
const EVICT_BATCH = 50;    // видаляємо N найстаріших коли досягли ліміту

// Registry — щоб можна було очистити ВСІ кеші одним викликом (для backfill).
const REGISTRY: Array<AsyncCache<unknown>> = [];
export function clearAllStrategicCaches(): { cleared: string[] } {
  const cleared: string[] = [];
  for (const c of REGISTRY) { c.clear(); cleared.push(c.getName()); }
  return { cleared };
}

export class AsyncCache<T> {
  private map = new Map<string, Entry<T>>();

  constructor(private ttlMs: number, private name: string) {
    REGISTRY.push(this as AsyncCache<unknown>);
  }

  getName() { return this.name; }

  /**
   * Отримати значення з кешу або запустити fetcher (дедуплікація race).
   * Fetcher викликається ЛИШЕ якщо cache miss І немає in-flight запиту.
   */
  async getOrLoad(key: string, fetcher: () => Promise<T>, ttlOverrideMs?: number): Promise<T> {
    const now = Date.now();
    const entry = this.map.get(key);
    // ttlOverride — коротший TTL для періодів, що задівають поточний (ще
    // догружуваний) місяць, щоб після синку 1С не показувати старі числа до 5 хв.
    const ttl = ttlOverrideMs ?? this.ttlMs;

    if (entry && now - entry.at < ttl) {
      // Cache hit (свіжий)
      if (entry.ready !== undefined) return entry.ready;
      if (entry.pending) return entry.pending;
    }

    // Cache miss АБО протухлий. Запускаємо fetcher і публікуємо Promise
    // одразу — щоб паралельні запити приєднались.
    const promise = fetcher().then(result => {
      // Оновлюємо запис на готовий і повертаємо. Заморожуємо щоб caller
      // не міг мутувати shared reference.
      this.map.set(key, { at: Date.now(), ready: deepFreeze(result) });
      this.evictIfNeeded();
      return result;
    }).catch(err => {
      // При помилці — видаляємо запис щоб наступний виклик спробував знову.
      this.map.delete(key);
      throw err;
    });

    this.map.set(key, { at: now, pending: promise });
    return promise;
  }

  /** Sync API для legacy місць. Повертає frozen ready value або null.
   *  ttlOverrideMs — коротший TTL для періодів з поточним місяцем. */
  get(key: string, ttlOverrideMs?: number): T | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at >= (ttlOverrideMs ?? this.ttlMs)) return null;
    return entry.ready ?? null;
  }

  /** Sync set — freeze + LRU eviction. */
  set(key: string, value: T) {
    this.map.set(key, { at: Date.now(), ready: deepFreeze(value) });
    this.evictIfNeeded();
  }

  clear() { this.map.clear(); }

  /** LRU eviction — коли ліміт перевищено, видаляємо найстарші EVICT_BATCH. */
  private evictIfNeeded() {
    if (this.map.size <= MAX_ENTRIES) return;
    const entries = Array.from(this.map.entries()).sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < EVICT_BATCH && i < entries.length; i++) {
      this.map.delete(entries[i][0]);
    }
  }
}

/**
 * Чи період (з ексклюзивним кінцем dateToIso) задіває поточний місяць. Тоді
 * кеш має короткий TTL — дані місяця ще догружаються синком 1С, і 5-хв кеш
 * показував би старі числа після синку.
 */
export function periodTouchesCurrentMonth(dateToIso: string): boolean {
  const now = new Date();
  const curMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return new Date(dateToIso).getTime() > curMonthStart;
}

/** Короткий TTL (90 с) для періодів, що включають поточний місяць. */
export const CURRENT_MONTH_TTL_MS = 90_000;

/**
 * Рекурсивно замортожує об'єкт. Set/Map не заморожуються (їх не використовуємо
 * у кеш-value; JSON-подібні структури тільки).
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    const v = (obj as Record<string, unknown>)[key];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return obj;
}
