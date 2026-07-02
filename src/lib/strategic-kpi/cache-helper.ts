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

export class AsyncCache<T> {
  private map = new Map<string, Entry<T>>();

  constructor(private ttlMs: number, private name: string) {}

  /**
   * Отримати значення з кешу або запустити fetcher (дедуплікація race).
   * Fetcher викликається ЛИШЕ якщо cache miss І немає in-flight запиту.
   */
  async getOrLoad(key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.map.get(key);

    if (entry && now - entry.at < this.ttlMs) {
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
