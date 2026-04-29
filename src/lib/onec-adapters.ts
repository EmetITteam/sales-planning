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
  GetRegionDataResponse,
  GetTrainingsResponse,
  OneCTraining,
} from './onec-types';
import type {
  UserSession,
  Client1C,
  SalesFactResponse,
  RegionDataResponse,
  Training,
} from './types';

// === Категорії клієнтів: 1С (UA) → UI (en code) ===
const CATEGORY_MAP: Record<string, Client1C['category']> = {
  'Активний': 'active',
  'Сплячий': 'sleeping',
  'Втрачений': 'lost',
  'Новий': 'new',
  'БезЗакупок': 'none',
};

export function mapClientCategory(categoryUA: string): Client1C['category'] {
  return CATEGORY_MAP[categoryUA] ?? 'none';
}

// === login ===
export function adaptLogin(r: LoginResponse): UserSession {
  return {
    login: r.login,
    fullName: r.fullName,
    role: r.roleCode,
    region: r.region,
    regionCode: r.regionCode,
    managedUsers: r.managedUsers ?? [],
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
      latestAmount = p.lastPurchaseAmount;
    }
  }

  return {
    clientId: c.clientId,
    clientName: c.clientName,
    category: mapClientCategory(c.category),
    lastPurchaseDate: latestDate,
    lastPurchaseAmount: latestAmount,
    totalYTD: c.purchases.reduce((s, p) => s + p.lastPurchaseAmount, 0),
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
    const purchase = c.purchases.find(p => p.segmentCode === segmentCode);
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      category: mapClientCategory(c.category),
      lastPurchaseDate: purchase?.lastPurchaseDate ?? null,
      lastPurchaseAmount: purchase?.lastPurchaseAmount ?? 0,
      totalYTD: purchase?.lastPurchaseAmount ?? 0,
      meetingsThisMonth: 0,
      callsThisMonth: 0,
      phone: c.phone,
      address: '',
    };
  });
}

// === getSalesFact ===
export function adaptSalesFact(r: GetSalesFactResponse): SalesFactResponse {
  return {
    facts: r.segments.map(s => ({
      segmentCode: s.segmentCode,
      totalAmount: s.totalFactUSD,
      clients: s.clients.map(c => ({
        clientId: c.clientId,
        clientName: c.clientName,
        amount: c.factAmountUSD,
        lastSaleDate: '', // спека не повертає дату на рівні клієнта
      })),
    })),
  };
}

// === getRegionData ===
export function adaptRegionData(r: GetRegionDataResponse): RegionDataResponse {
  return {
    regionName: r.region,
    regionCode: '', // у спеці немає — frontend має знати з контексту (login)
    asOfDate: r.asOfDate,
    prevMonthAsOfDate: r.prevMonthAsOfDate,
    managers: r.managers.map(m => ({
      login: m.managerLogin,
      name: m.managerName,
      totalPrevMonthFact: m.totalPrevMonthFact,
      segments: m.segments.map(s => ({
        segmentCode: s.segmentCode,
        segmentName: s.segmentName,
        planAmount: s.planAmountUSD,
        factAmount: s.factAmountUSD,
        factPercent: s.planAmountUSD > 0 ? (s.factAmountUSD / s.planAmountUSD) * 100 : 0,
        prevMonthFactAmount: s.prevMonthFactUSD,
        prevMonthPlanAmount: s.prevMonthPlanUSD,
        prevMonthFactPercent: s.prevMonthFactPercent ?? 0,
      })),
    })),
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
