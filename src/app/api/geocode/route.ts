/**
 * GET /api/geocode?lat=X&lon=Y — reverse-geocoding через Nominatim (OpenStreetMap).
 *
 * Чому через server-route, а не напряму з браузера:
 *  - Nominatim ToS вимагає правильний User-Agent з контактом
 *  - Захист IP клієнта (Nominatim не бачить менеджерів окремо)
 *  - Можливість cached/rate-limit'у у майбутньому
 *
 * Rate limit Nominatim публічного API: 1 req/sec. Для одного менеджера, який
 * розпочинає 1 зустріч раз у годину — більш ніж достатньо. Якщо в майбутньому
 * звернень буде більше — переключити на платний Mapbox/Google.
 *
 * Fallback: якщо Nominatim повертає помилку — повертаємо координати як рядок
 * щоб UI міг показати хоч щось.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'EMET-SalesPlanning/1.0 (vega.jamal@gmail.com)';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: 'lat & lon required as numbers' }, { status: 400 });
  }

  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=uk&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      // Nominatim повільний — даємо до 6 секунд
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return Response.json(
        { address: formatCoords(lat, lon), fallback: true, reason: `nominatim HTTP ${res.status}` },
        { status: 200 },
      );
    }
    const data = (await res.json()) as { display_name?: string; address?: NominatimAddress };
    const formatted = formatNominatim(data);
    if (!formatted) {
      return Response.json(
        { address: formatCoords(lat, lon), fallback: true, reason: 'no address found' },
        { status: 200 },
      );
    }
    return Response.json({ address: formatted, fallback: false }, { status: 200 });
  } catch (e) {
    return Response.json(
      {
        address: formatCoords(lat, lon),
        fallback: true,
        reason: (e as Error).message || 'unknown error',
      },
      { status: 200 },
    );
  }
}

interface NominatimAddress {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
}

/**
 * Перетворює Nominatim address у короткий human-readable рядок.
 * Приклад: "вул. Хорива 42, Поділ, Київ".
 */
function formatNominatim(data: { display_name?: string; address?: NominatimAddress }): string | null {
  const a = data.address;
  if (!a) return data.display_name ?? null;

  const parts: string[] = [];
  if (a.road) {
    parts.push(a.house_number ? `${a.road} ${a.house_number}` : a.road);
  }
  const neighbourhood = a.suburb ?? a.neighbourhood;
  if (neighbourhood) parts.push(neighbourhood);
  const city = a.city ?? a.town ?? a.village;
  if (city) parts.push(city);

  if (parts.length === 0) return data.display_name ?? null;
  return parts.join(', ');
}

function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
