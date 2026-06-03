/**
 * Geo-capture utility для зустрічей (Sprint 1.4).
 *
 * Обгортка над `navigator.geolocation.getCurrentPosition` з:
 *  - timeout 10s
 *  - категорізованими помилками (denied / unavailable / timeout / unsupported)
 *  - promise-based API замість callback
 *  - opt-in high-accuracy
 *
 * Reverse-geocoding (lat/lon → адреса) поки stub — повертає форматовані
 * координати. Реальний Google/Nominatim API підключаємо у Sprint 1.5 разом
 * з buffer-worker, бо потребує API-ключа і rate-limit handling.
 *
 * ADR-7: зафіксовані координати read-only — НЕ редагуються в UI після capture.
 */

export type GeoFailureReason =
  | 'permission_denied'   // user said no
  | 'position_unavailable' // GPS off, no signal
  | 'timeout'             // 10s exceeded
  | 'unsupported';        // navigator.geolocation відсутній (старий браузер)

export interface GeoCaptureSuccess {
  ok: true;
  lat: number;
  lon: number;
  accuracyMeters: number;
  /** Human-readable address. Поки — coord-string. */
  address: string;
  capturedAt: string; // ISO timestamp
}

export interface GeoCaptureFailure {
  ok: false;
  reason: GeoFailureReason;
  message: string;
}

export type GeoCaptureResult = GeoCaptureSuccess | GeoCaptureFailure;

const TIMEOUT_MS = 10_000;
const MAX_AGE_MS = 30_000; // приймемо cached fix не старше 30с

/**
 * Запит геолокації. Resolves з success або categorized failure
 * (НЕ rejects — caller обробляє через discriminated union).
 */
export function captureGeo(): Promise<GeoCaptureResult> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve({
      ok: false,
      reason: 'unsupported',
      message: 'Браузер не підтримує геолокацію. Введіть адресу вручну.',
    });
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          address: formatCoords(pos.coords.latitude, pos.coords.longitude),
          capturedAt: new Date().toISOString(),
        });
      },
      err => resolve(mapError(err)),
      {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
      },
    );
  });
}

export function mapError(err: GeolocationPositionError): GeoCaptureFailure {
  switch (err.code) {
    case 1: // PERMISSION_DENIED
      return {
        ok: false,
        reason: 'permission_denied',
        message: 'Геолокація заборонена. Дозвольте у налаштуваннях браузера або введіть адресу вручну.',
      };
    case 2: // POSITION_UNAVAILABLE
      return {
        ok: false,
        reason: 'position_unavailable',
        message: 'GPS недоступний (вимкнено або немає сигналу). Введіть адресу вручну.',
      };
    case 3: // TIMEOUT
      return {
        ok: false,
        reason: 'timeout',
        message: 'Геолокація не відповіла за 10 секунд. Спробуйте ще раз або введіть адресу вручну.',
      };
    default:
      return {
        ok: false,
        reason: 'position_unavailable',
        message: 'Невідома помилка геолокації. Введіть адресу вручну.',
      };
  }
}

/** Форматує координати як human-readable рядок (stub перед reverse-geocoding). */
export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export type GeoPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * Перевіряє стан дозволу на геолокацію через Permissions API.
 *
 * Важливо для UX: коли користувач один раз сказав «Заборонити», браузер
 * запам'ятовує це і при наступному `getCurrentPosition` миттєво повертає
 * `code=1 PERMISSION_DENIED` БЕЗ показу UI prompt. Кнопка «Спробувати ще
 * раз» у цьому випадку безглузда — треба показати інструкцію як ввімкнути.
 *
 * Safari < 16 і деякі mobile-браузери не підтримують Permissions API
 * для geolocation → повертає `unknown` (caller має fallback показати retry).
 */
export async function getGeoPermissionState(): Promise<GeoPermissionState> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
    return 'unknown';
  }
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return result.state as GeoPermissionState;
  } catch {
    return 'unknown';
  }
}
