/**
 * Адаптери: 1С response → UI типи.
 *
 * Це місце де ми ізолюємо frontend від змін 1С-протоколу.
 * Якщо 1С зміниться (нові поля, перейменування), правимо тут — UI не торкаємо.
 *
 * Конвенція: для кожного метода — функція `adapt<Action>(response): UIType`.
 */

import type {
  LoginResponse,
  GetClientsForPlanningResponse,
  OneCPlanningClient,
  GetSalesFactResponse,
  GetRegistryPlansResponse,
  GetRegionDataResponse,
  GetTrainingsResponse,
  OneCTraining,
  OneCManagerClientStats,
} from './onec-types';
import type {
  UserSession,
  Client1C,
  SalesFactResponse,
  RegistryPlan,
  RegionDataResponse,
  Training,
  ClientCategoryStats,
} from './types';
import { isActiveDivision, REGIONS } from './regions';

// === Категорії клієнтів: 1С → UI (en code) ===
// 1С реально віддає російською; залишаємо й українські варіанти на випадок
// якщо колись перейдуть на UA. Регістр не критичний — нормалізуємо.
const CATEGORY_MAP: Record<string, Client1C['category']> = {
  // RU (як приходить зараз)
  'активный': 'active',
  'спящий': 'sleeping',
  'потерянный': 'lost',
  'новый': 'new',
  'без закупок': 'none',
  // UA (на майбутнє)
  'активний': 'active',
  'сплячий': 'sleeping',
  'втрачений': 'lost',
  'новий': 'new',
  'беззакупок': 'none',
};

export function mapClientCategory(category: string): Client1C['category'] {
  return CATEGORY_MAP[category.trim().toLowerCase()] ?? 'none';
}

/** 1С повертає суми як рядок ("360.00") — приводимо до number. */
function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 🆕 v2.5: 5 категорій 1С → 3-картка UI.
 *  active   = active
 *  sleeping = sleeping + lost  (втрачений показується у тій самій картці)
 *  new      = new
 *  none     — у totalClients, але без власної картки
 */
function mapManagerClientStats(raw: OneCManagerClientStats): ClientCategoryStats {
  return {
    active: {
      total: toNumber(raw.active.total),
      bought: toNumber(raw.active.bought),
    },
    sleeping: {
      total: toNumber(raw.sleeping.total) + toNumber(raw.lost.total),
      bought: toNumber(raw.sleeping.bought) + toNumber(raw.lost.bought),
    },
    newClients: {
      total: toNumber(raw.new.total),
      bought: toNumber(raw.new.bought),
    },
    totalBought: toNumber(raw.totalBought),
    totalClients: toNumber(raw.totalClients),
  };
}

// === Мапа кодів сегментів: 1С → UI ===
// 1С повертає `ДРУГИЕТМ` для категорії «Інші ТМ», у нас в UI/моках цей сегмент
// називається `OTHER`. Решта 8 брендів збігаються (PETARAN/NEURAMIS/ESSE/...).
const SEGMENT_CODE_MAP: Record<string, string> = {
  'ДРУГИЕТМ': 'OTHER',
};

function mapSegmentCode(code: string): string {
  return SEGMENT_CODE_MAP[code] ?? code;
}

// === login ===
export function adaptLogin(r: LoginResponse): UserSession {
  return {
    // Нормалізуємо логін до lower-case + trim — інакше при join з Action 4
    // (registryPlans.managerLogin теж lower-cased у нас) міг би бути desync.
    // Також `loginToUserId` lowercase'ить — тут джерело істини консистентне.
    login: (r.login || '').toLowerCase().trim(),
    fullName: r.fullName,
    role: r.roleCode,
    region: r.region,
    regionCode: r.regionCode,
    managedUsers: (r.managedUsers ?? []).map(l => (l || '').toLowerCase().trim()),
  };
}

// === getClientsForPlanning ===
/**
 * Повертає масив Client1C — НО Client1C має поле `lastPurchaseDate/Amount`
 * як одне число (без сегменту), а 1С віддає `purchases[]` (по бренду).
 *
 * Тому: для кожного клієнта робимо «найсвіжішу покупку незалежно від бренду».
 * Це той формат що використовує `client-search-modal` і `MOCK_CLIENTS_PETARAN`.
 *
 * Поля яких НЕМА у спеці 1С — заповнюємо дефолтами:
 *  - totalYTD: 0 (не у спеці; можна агрегувати з purchases[].lastPurchaseAmount)
 *  - meetingsThisMonth: 0 (потребує окремий метод 1С — пізніше)
 *  - callsThisMonth: 0 (так само)
 *  - address: '' (нема у спеці)
 *
 * NB: для повноцінного режиму планування по сегменту нам потрібна
 * інша структура (покупки розрізі по сегментах). Поки повертаємо
 * найсвіжішу для відображення у списках.
 */
export function adaptClientsForPlanning(r: GetClientsForPlanningResponse): Client1C[] {
  return r.clients.map(adaptPlanningClient);
}

function adaptPlanningClient(c: OneCPlanningClient): Client1C {
  // Найсвіжіша покупка (max по lastPurchaseDate)
  let latestDate: string | null = null;
  let latestAmount = 0;
  for (const p of c.purchases) {
    if (!latestDate || p.lastPurchaseDate > latestDate) {
      latestDate = p.lastPurchaseDate;
      latestAmount = toNumber(p.lastPurchaseAmount);
    }
  }

  return {
    clientId: c.clientId,
    clientName: c.clientName,
    category: mapClientCategory(c.category),
    lastPurchaseDate: latestDate,
    lastPurchaseAmount: latestAmount,
    totalYTD: c.purchases.reduce((s, p) => s + toNumber(p.lastPurchaseAmount), 0),
    meetingsThisMonth: 0,
    callsThisMonth: 0,
    phone: c.phone,
    address: '',
  };
}

/**
 * Альтернативна версія: тільки клієнти що купували конкретний сегмент.
 * Використовується у формі планування — менеджер обирає бренд і бачить
 * тільки відповідних клієнтів з їх покупками по бренду.
 */
export function adaptClientsForSegment(
  r: GetClientsForPlanningResponse,
  segmentCode: string,
): Client1C[] {
  return r.clients.map((c): Client1C => {
    const purchase = c.purchases.find(p => mapSegmentCode(p.segmentCode) === segmentCode);
    const amount = toNumber(purchase?.lastPurchaseAmount);
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      category: mapClientCategory(c.category),
      lastPurchaseDate: purchase?.lastPurchaseDate ?? null,
      lastPurchaseAmount: amount,
      totalYTD: amount,
      meetingsThisMonth: 0,
      callsThisMonth: 0,
      phone: c.phone,
      address: '',
    };
  });
}

// === getSalesFact ===
export function adaptSalesFact(r: GetSalesFactResponse): SalesFactResponse {
  // 1С віддає числові поля рядками ("521.00") — приводимо через toNumber.
  return {
    facts: r.segments.map(s => ({
      segmentCode: mapSegmentCode(s.segmentCode),
      totalAmount: toNumber(s.totalFactUSD as number | string),
      totalClientCount: toNumber(s.totalClientCount as number | string),
      clients: s.clients.map(c => ({
        clientId: c.clientId,
        clientName: c.clientName,
        amount: toNumber(c.factAmountUSD as number | string),
        lastSaleDate: '', // спека не повертає дату на рівні клієнта
      })),
    })),
  };
}

// === getRegistryPlans ===
/**
 * Адаптер для Action 4. Реальна 1С повертає плани по ВСІХ підрозділах
 * (включно з архівними/неактивними типу `Лазерхауз*`, `Адасса`, `Коллцентр`).
 * Тут залишаємо тільки 8 активних регіонів (REGIONS — див. regions.ts),
 * приводимо planAmountUSD до number, мапаємо segmentCode (ДРУГИЕТМ → OTHER).
 *
 * Записи з порожнім managerLogin (1С не має email для деяких користувачів)
 * залишаємо — UI вирішить що з ними робити (можливо показувати як «без менеджера»
 * або агрегувати у «нерозподілений план регіону»).
 */
export function adaptRegistryPlans(r: GetRegistryPlansResponse): RegistryPlan[] {
  return r.plans
    .filter(p => isActiveDivision(p.divisionName))
    .map(p => {
      const region = REGIONS.find(reg => reg.name === p.divisionName);
      return {
        period: p.period,
        // Нормалізуємо case — 1С може віддати "Ivanov@emet" і "ivanov@emet"
        // у різних місцях (різні джерела). Frontend джойнить по login, тому
        // приводимо до lower-case на адаптері (на login-сторінці теж лoadLoginimitable).
        managerLogin: (p.managerLogin || '').toLowerCase().trim(),
        managerName: p.managerName,
        regionName: p.divisionName,
        regionCode: region?.code ?? '',
        segmentCode: mapSegmentCode(p.segmentCode),
        segmentName: p.segmentName,
        planAmount: toNumber(p.planAmountUSD),
      };
    });
}

// === getRegionData (v2.4: regions[]) ===
export function adaptRegionData(r: GetRegionDataResponse): RegionDataResponse {
  // 1С майже точно віддасть числа рядками (як в Action 2/3/4) — обгортаємо.
  // v2.4: r.regions[] — масив регіонів (РМ → 1, Директор → 8 активних).
  //
  // 1С повертає ВСІ підрозділи включно з архівними (Лазерхауз*, Полтава*,
  // Чернівці*, Адасса, Коллцентр) — фільтруємо тут через isActiveDivision,
  // щоб дашборд показував тільки 8 активних регіонів зі списку REGIONS.
  //
  // 2026-05-07: 1С-розробник виправив порядок полів (raніше regionName/regionCode
  // приходили переплутаними). Hueristic нижче залишаємо як defensive fallback.
  return {
    asOfDate: r.asOfDate,
    prevMonthAsOfDate: r.prevMonthAsOfDate,
    regions: r.regions
      .map(reg => {
        const isSwapped = /^[A-Z]{2,5}$/.test(reg.regionName) && /[А-Яа-яіїєґІЇЄҐ]/.test(reg.regionCode);
        return {
          raw: reg,
          realName: isSwapped ? reg.regionCode : reg.regionName,
          realCode: isSwapped ? reg.regionName : reg.regionCode,
        };
      })
      .filter(({ realName }) => isActiveDivision(realName))
      .map(({ raw: reg, realName, realCode }) => {
      const fallback = REGIONS.find(x => x.name === realName);
      return {
        regionName: realName,
        regionCode: realCode || fallback?.code || '',
        // Фільтруємо менеджерів без плану — 1С повертає у managers[] усіх
        // (включно з тими хто звільнений / у відпустці / без плану), у нас
        // вони показувались як "Хамуляк А. 0%" псуючи UI. Ховаємо їх.
        managers: reg.managers.filter(m => {
          const totalPlan = m.segments.reduce((a, s) => a + toNumber(s.planAmountUSD as number | string), 0);
          const totalFact = m.segments.reduce((a, s) => a + toNumber(s.factAmountUSD as number | string), 0);
          const totalPrev = toNumber(m.totalPrevMonthFact as number | string);
          // Показуємо якщо є хоч щось — план, факт або історія минулого місяця
          return totalPlan > 0 || totalFact > 0 || totalPrev > 0;
        }).map(m => {
          const totalPrevMonthFact = toNumber(m.totalPrevMonthFact as number | string);
          return {
            login: (m.managerLogin || '').toLowerCase().trim(),
            name: m.managerName,
            totalPrevMonthFact,
            // v2.5: якщо 1С повернула clientStats — нормалізуємо у UI-формат.
            // Якщо ні (1С на старій версії) — undefined, дашборди фолбекнуть на useClientsAggregate.
            clientStats: m.clientStats ? mapManagerClientStats(m.clientStats) : undefined,
            segments: m.segments.map(s => {
              const planAmount = toNumber(s.planAmountUSD as number | string);
              const factAmount = toNumber(s.factAmountUSD as number | string);
              return {
                segmentCode: mapSegmentCode(s.segmentCode),
                segmentName: s.segmentName,
                planAmount,
                factAmount,
                factPercent: planAmount > 0 ? (factAmount / planAmount) * 100 : 0,
                prevMonthFactAmount: toNumber(s.prevMonthFactUSD as number | string),
                prevMonthPlanAmount: toNumber(s.prevMonthPlanUSD as number | string),
                prevMonthFactPercent: toNumber(s.prevMonthFactPercent as number | string),
              };
            }),
          };
        }),
      };
    }),
  };
}

// === getTrainings ===
export function adaptTrainings(r: GetTrainingsResponse): Training[] {
  return r.trainings.map(adaptTraining);
}

function adaptTraining(t: OneCTraining): Training {
  return {
    trainingId: t.trainingId,
    trainingName: t.trainingName,
    trainingType: t.trainingType,
    date: t.date,
    regionCode: t.regionCode,
    regionName: t.regionName,
    city: t.city,
  };
}
