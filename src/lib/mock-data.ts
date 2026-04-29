import type {
  UserSession,
  SalesPlanResponse,
  SalesFactResponse,
  Client1C,
  RegionDataResponse,
  RegionSummary,
  ForecastRow,
  GapClosureRow,
  TMSummaryCard,
  Training,
} from './types';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from './working-days';
import { calcForecastPercent, calcExpectedPercent, pctOf } from './format';

// === Тестові користувачі ===
export const MOCK_USERS: Record<string, UserSession> = {
  'feshchenko@emet.com': {
    login: 'feshchenko@emet.com',
    fullName: 'Фещенко Олена',
    role: 'manager',
    region: 'Дніпро',
    regionCode: 'DNP',
    managedUsers: [],
  },
  'sirik@emet.com': {
    login: 'sirik@emet.com',
    fullName: 'Сірик Наталія',
    role: 'manager',
    region: 'Дніпро',
    regionCode: 'DNP',
    managedUsers: [],
  },
  'rm.dnipro@emet.com': {
    login: 'rm.dnipro@emet.com',
    fullName: 'Іванова Марина',
    role: 'rm',
    region: 'Дніпро',
    regionCode: 'DNP',
    managedUsers: ['feshchenko@emet.com', 'sirik@emet.com'],
  },
  'director@emet.com': {
    login: 'director@emet.com',
    fullName: 'Петренко Андрій',
    role: 'director',
    region: '',
    regionCode: '',
    managedUsers: ['rm.dnipro@emet.com', 'rm.kyiv@emet.com', 'rm.odesa@emet.com', 'rm.lviv@emet.com', 'rm.kharkiv@emet.com', 'rm.zaporizhzhia@emet.com', 'rm.vinnytsia@emet.com'],
  },
};

// === Сегменти (ТМ) ===
export const SEGMENTS = [
  { code: 'PETARAN', name: 'Petaran' },
  { code: 'ELLANSE', name: 'Ellanse' },
  { code: 'EXOXE', name: 'EXOXE' },
  { code: 'ESSE', name: 'ESSE' },
  { code: 'NEURAMIS', name: 'Neuramis' },
  { code: 'NEURONOX', name: 'Neuronox' },
  { code: 'VITARAN', name: 'Vitaran' },
  { code: 'IUSE', name: 'IUSE' },
  { code: 'OTHER', name: 'Інші ТМ' },
];

// === Плани продажів ===
export const MOCK_SALES_PLAN: SalesPlanResponse = {
  plans: [
    { segmentCode: 'PETARAN', segmentName: 'Petaran', planAmount: 7490, currency: 'USD' },
    { segmentCode: 'ELLANSE', segmentName: 'Ellanse', planAmount: 9963, currency: 'USD' },
    { segmentCode: 'EXOXE', segmentName: 'EXOXE', planAmount: 3042, currency: 'USD' },
    { segmentCode: 'ESSE', segmentName: 'ESSE', planAmount: 4960, currency: 'USD' },
    { segmentCode: 'NEURAMIS', segmentName: 'Neuramis', planAmount: 5254, currency: 'USD' },
    { segmentCode: 'NEURONOX', segmentName: 'Neuronox', planAmount: 14452, currency: 'USD' },
    { segmentCode: 'VITARAN', segmentName: 'Vitaran', planAmount: 28782, currency: 'USD' },
    { segmentCode: 'IUSE', segmentName: 'IUSE', planAmount: 5000, currency: 'USD' },
    { segmentCode: 'OTHER', segmentName: 'Інші ТМ', planAmount: 12306, currency: 'USD' },
  ],
  exchangeRate: 41.35,
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
};

// === Факт продажів ===
export const MOCK_SALES_FACT: SalesFactResponse = {
  facts: [
    { segmentCode: 'PETARAN', totalAmount: 378, clients: [{ clientId: 'C001', clientName: 'Бліндовська Яна Олександрівна', amount: 378, lastSaleDate: '2026-03-05' }] },
    { segmentCode: 'ELLANSE', totalAmount: 3658, clients: [{ clientId: 'C010', clientName: 'Єфіменко Наталія', amount: 3000, lastSaleDate: '2026-03-04' }, { clientId: 'C011', clientName: 'Мачтакова Марина', amount: 658, lastSaleDate: '2026-03-06' }] },
    { segmentCode: 'EXOXE', totalAmount: 170, clients: [{ clientId: 'C020', clientName: 'Ворошилова Елена', amount: 170, lastSaleDate: '2026-03-07' }] },
    { segmentCode: 'ESSE', totalAmount: 2738, clients: [{ clientId: 'C030', clientName: 'Клініка Гіппократ', amount: 540, lastSaleDate: '2026-03-06' }, { clientId: 'C031', clientName: 'Одінцова Інна', amount: 525, lastSaleDate: '2026-03-05' }, { clientId: 'C032', clientName: 'Красуля Олена', amount: 1673, lastSaleDate: '2026-03-07' }] },
    { segmentCode: 'NEURAMIS', totalAmount: 738, clients: [{ clientId: 'C040', clientName: 'Перекрест Катерина', amount: 69, lastSaleDate: '2026-03-04' }, { clientId: 'C041', clientName: 'Миронова Яна', amount: 669, lastSaleDate: '2026-03-06' }] },
    { segmentCode: 'NEURONOX', totalAmount: 1935, clients: [{ clientId: 'C050', clientName: 'Клініка Гіппократ', amount: 540, lastSaleDate: '2026-03-06' }, { clientId: 'C051', clientName: 'Тараненко Альона', amount: 285, lastSaleDate: '2026-03-05' }, { clientId: 'C052', clientName: 'Федоренко Надія', amount: 285, lastSaleDate: '2026-03-05' }, { clientId: 'C053', clientName: 'Посунько Юлія', amount: 380, lastSaleDate: '2026-03-06' }, { clientId: 'C054', clientName: 'Одінцова Інна', amount: 445, lastSaleDate: '2026-03-07' }] },
    { segmentCode: 'VITARAN', totalAmount: 5212, clients: [{ clientId: 'C060', clientName: 'Різні клієнти', amount: 5212, lastSaleDate: '2026-03-08' }] },
    { segmentCode: 'IUSE', totalAmount: 320, clients: [{ clientId: 'C080', clientName: 'Різні клієнти', amount: 320, lastSaleDate: '2026-03-08' }] },
    { segmentCode: 'OTHER', totalAmount: 2860, clients: [{ clientId: 'C070', clientName: 'Різні клієнти', amount: 2860, lastSaleDate: '2026-03-08' }] },
  ],
};

// === Клієнти по сегменту (приклад для Petaran) ===
export const MOCK_CLIENTS_PETARAN: Client1C[] = [
  { clientId: 'C001', clientName: 'Бліндовська Яна Олександрівна', category: 'active', lastPurchaseDate: '2026-03-05', lastPurchaseAmount: 378, totalYTD: 756, meetingsThisMonth: 1, callsThisMonth: 3, phone: '+380501234567', address: 'м. Дніпро' },
  { clientId: 'C002', clientName: 'Андрущук Катерина Миколаївна', category: 'active', lastPurchaseDate: '2026-02-10', lastPurchaseAmount: 378, totalYTD: 378, meetingsThisMonth: 0, callsThisMonth: 2, phone: '+380509876543', address: 'м. Дніпро' },
  { clientId: 'C003', clientName: 'Гімішлі Анастасія Миколаївна', category: 'active', lastPurchaseDate: '2026-01-20', lastPurchaseAmount: 252, totalYTD: 252, meetingsThisMonth: 0, callsThisMonth: 1, phone: '+380671234567', address: 'м. Дніпро' },
  { clientId: 'C004', clientName: 'Головатая Алла', category: 'active', lastPurchaseDate: '2026-02-15', lastPurchaseAmount: 252, totalYTD: 504, meetingsThisMonth: 1, callsThisMonth: 2, phone: '+380631234567', address: 'м. Запоріжжя' },
  { clientId: 'C005', clientName: 'Календа Марина', category: 'active', lastPurchaseDate: '2026-02-25', lastPurchaseAmount: 252, totalYTD: 1260, meetingsThisMonth: 1, callsThisMonth: 4, phone: '+380951234567', address: 'м. Дніпро' },
  { clientId: 'C006', clientName: 'Карпенко Вікторія', category: 'active', lastPurchaseDate: '2026-02-28', lastPurchaseAmount: 252, totalYTD: 252, meetingsThisMonth: 0, callsThisMonth: 1, phone: '+380661234567', address: 'м. Дніпро' },
  { clientId: 'C007', clientName: "Лисенко Дар'я", category: 'active', lastPurchaseDate: '2026-02-20', lastPurchaseAmount: 252, totalYTD: 504, meetingsThisMonth: 0, callsThisMonth: 1, phone: '+380681234567', address: 'м. Дніпро' },
  { clientId: 'C008', clientName: 'Ліпунова Аліна Олександрівна', category: 'active', lastPurchaseDate: '2026-01-30', lastPurchaseAmount: 378, totalYTD: 378, meetingsThisMonth: 0, callsThisMonth: 2, phone: '+380501234568', address: 'м. Дніпро' },
  { clientId: 'C009', clientName: 'Воронько Катерина Олександрівна', category: 'active', lastPurchaseDate: '2026-02-05', lastPurchaseAmount: 595, totalYTD: 595, meetingsThisMonth: 0, callsThisMonth: 3, phone: '+380671234568', address: 'м. Дніпро' },
  { clientId: 'C100', clientName: 'Карапиш Лариса Володимирівна', category: 'active', lastPurchaseDate: '2026-03-05', lastPurchaseAmount: 378, totalYTD: 756, meetingsThisMonth: 1, callsThisMonth: 2, phone: '+380951234568', address: 'м. Дніпро' },
  { clientId: 'C101', clientName: 'Астровська Катерина Юріївна', category: 'sleeping', lastPurchaseDate: '2025-11-10', lastPurchaseAmount: 378, totalYTD: 0, meetingsThisMonth: 0, callsThisMonth: 1, phone: '+380631234568', address: 'м. Дніпро' },
  { clientId: 'C102', clientName: 'Булдакова Регіна', category: 'sleeping', lastPurchaseDate: '2025-10-05', lastPurchaseAmount: 252, totalYTD: 0, meetingsThisMonth: 0, callsThisMonth: 0, phone: '+380661234568', address: 'м. Шахтарськ' },
];

// === Прогноз по активних (купували за останні 3 міс) ===
export const MOCK_FORECASTS_PETARAN: ForecastRow[] = [
  // Невиконані (зверху)
  { clientId1c: 'C002', clientName: 'Андрущук Катерина Миколаївна', forecastAmount: 378, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: true, factAmount: 0, lastPurchaseDate: '2026-02-10', lastPurchaseAmount: 378, completed: false },
  { clientId1c: 'C003', clientName: 'Гімішлі Анастасія Миколаївна', forecastAmount: 252, stage: 'Дзвінок', stageComment: 'запросити на навчання', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-01-20', lastPurchaseAmount: 252, completed: false },
  { clientId1c: 'C004', clientName: 'Головатая Алла', forecastAmount: 252, stage: 'Зустріч', stageComment: 'зустріч в офісі', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-02-15', lastPurchaseAmount: 252, completed: false },
  { clientId1c: 'C005', clientName: 'Календа Марина', forecastAmount: 252, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: true, factAmount: 0, lastPurchaseDate: '2026-02-25', lastPurchaseAmount: 252, completed: false },
  { clientId1c: 'C008', clientName: 'Ліпунова Аліна Олександрівна', forecastAmount: 378, stage: 'Дзвінок', stageComment: 'продаж акції після відпустки', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-01-30', lastPurchaseAmount: 378, completed: false },
  { clientId1c: 'C009', clientName: 'Воронько Катерина Олександрівна', forecastAmount: 595, stage: 'Дзвінок', stageComment: 'акція від 5 флаконів', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-02-05', lastPurchaseAmount: 595, completed: false },
  { clientId1c: 'C006', clientName: 'Карпенко Вікторія', forecastAmount: 252, stage: 'Дзвінок', stageComment: 'нагадування', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-02-28', lastPurchaseAmount: 252, completed: false },
  { clientId1c: 'C007', clientName: "Лисенко Дар'я (Почетна)", forecastAmount: 252, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-02-20', lastPurchaseAmount: 252, completed: false },
  // Виконані (знизу)
  { clientId1c: 'C001', clientName: 'Бліндовська Яна Олександрівна', forecastAmount: 378, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: true, factAmount: 378, lastPurchaseDate: '2026-04-03', lastPurchaseAmount: 378, completed: true },
  { clientId1c: 'C100', clientName: 'Карапиш Лариса Володимирівна', forecastAmount: 378, stage: 'Зустріч', stageComment: 'зустріч + продаж', stageDone: true, factAmount: 378, lastPurchaseDate: '2026-04-04', lastPurchaseAmount: 378, completed: true },
];

// === Прогнози для інших брендів — щоб у демо клік на Ellanse/Vitaran/Neuronox ===
//     не показував порожній блок прогнозу.
export const MOCK_FORECASTS_OTHER: Record<string, ForecastRow[]> = {
  ELLANSE: [
    { clientId1c: 'C010', clientName: 'Єфіменко Наталія', forecastAmount: 3000, stage: 'Зустріч', stageComment: 'презентація нової лінії', stageDone: true, factAmount: 3000, lastPurchaseDate: '2026-04-04', lastPurchaseAmount: 3000, completed: true },
    { clientId1c: 'C011', clientName: 'Мачтакова Марина', forecastAmount: 658, stage: 'Дзвінок', stageComment: 'нагадування', stageDone: true, factAmount: 658, lastPurchaseDate: '2026-04-06', lastPurchaseAmount: 658, completed: true },
    { clientId1c: 'C012', clientName: 'Сидоренко Алла', forecastAmount: 850, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-02-20', lastPurchaseAmount: 850, completed: false },
  ],
  VITARAN: [
    { clientId1c: 'C060', clientName: 'Клініка Естетика+', forecastAmount: 2500, stage: 'Зустріч', stageComment: 'презентація для лікарів', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-02-15', lastPurchaseAmount: 1800, completed: false },
    { clientId1c: 'C061', clientName: 'Косметологія Світ', forecastAmount: 1700, stage: 'Дзвінок', stageComment: 'продовження співпраці', stageDone: true, factAmount: 1700, lastPurchaseDate: '2026-04-02', lastPurchaseAmount: 1700, completed: true },
  ],
  NEURONOX: [
    { clientId1c: 'C050', clientName: 'Клініка Гіппократ', forecastAmount: 540, stage: 'Дзвінок', stageComment: 'замовлення квартальне', stageDone: true, factAmount: 540, lastPurchaseDate: '2026-04-06', lastPurchaseAmount: 540, completed: true },
    { clientId1c: 'C054', clientName: 'Одінцова Інна', forecastAmount: 445, stage: 'Зустріч', stageComment: 'нова закупка', stageDone: true, factAmount: 445, lastPurchaseDate: '2026-04-07', lastPurchaseAmount: 445, completed: true },
    { clientId1c: 'C055', clientName: 'Іванова Олена', forecastAmount: 380, stage: 'Навчання', stageComment: 'після майстер-класу', stageDone: false, factAmount: 0, lastPurchaseDate: '2026-01-15', lastPurchaseAmount: 380, completed: false, trainingId: '4471', trainingName: 'ELLANSE Step 2 "Правильна колагеностимуляція"', trainingDate: '2026-05-15' },
  ],
};

// === Розриви для інших брендів ===
export const MOCK_GAP_OTHER: Record<string, GapClosureRow[]> = {
  ELLANSE: [
    { clientId1c: 'C015', clientName: 'Дрозд Надія', category: 'Сплячий', potentialAmount: 1200, stage: 'Дзвінок', stageComment: 'повернути після паузи', stageDone: false, completed: false, factAmount: 0, lastPurchaseDate: '2025-09-10', lastPurchaseAmount: 1100, deadline: '2026-04-25' },
  ],
  VITARAN: [
    { clientId1c: 'C065', clientName: 'Естетична клініка Z', category: 'Втрачений', potentialAmount: 1500, stage: 'Зустріч', stageComment: 'нова пропозиція', stageDone: false, completed: false, factAmount: 0, lastPurchaseDate: '2025-06-20', lastPurchaseAmount: 1500, deadline: '2026-04-28' },
  ],
};

// === Закриття розриву (неактивні — сплячі, втрачені, БЗ) ===
// v2.1: уніфіковано з ForecastRow — додано stage/stageDone/completed та поля trainingId/trainingName.
export const MOCK_GAP_CLOSURES: GapClosureRow[] = [
  { clientId1c: 'C101', clientName: 'Астровська Катерина Юріївна', category: 'Сплячий', potentialAmount: 378, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: false, completed: false, factAmount: 0, lastPurchaseDate: '2025-11-10', lastPurchaseAmount: 378, deadline: '2026-04-07' },
  { clientId1c: 'C102', clientName: 'Булдакова Регіна', category: 'Сплячий', potentialAmount: 252, stage: 'Дзвінок', stageComment: 'нагадування', stageDone: false, completed: false, factAmount: 0, lastPurchaseDate: '2025-10-05', lastPurchaseAmount: 252, deadline: '2026-04-07' },
  { clientId1c: 'C103', clientName: 'Вакуленко Катерина Олексіївна', category: 'Втрачений', potentialAmount: 378, stage: 'Зустріч', stageComment: 'презентація', stageDone: true, completed: true, factAmount: 378, lastPurchaseDate: '2026-04-02', lastPurchaseAmount: 378, deadline: '2026-04-08' },
  { clientId1c: 'C104', clientName: 'Дячок Олена Олексіївна', category: 'БЗ', potentialAmount: 378, stage: 'Навчання', stageComment: '', stageDone: false, completed: false, factAmount: 0, lastPurchaseDate: '2025-08-20', lastPurchaseAmount: 252, deadline: '2026-05-15', trainingId: '4471', trainingName: 'ELLANSE Step 2 "Правильна колагеностимуляція"', trainingDate: '2026-05-15' },
  { clientId1c: 'C105', clientName: 'Калина Ольга Сергіївна', category: 'Сплячий', potentialAmount: 252, stage: 'Дзвінок', stageComment: 'продаж акції', stageDone: false, completed: false, factAmount: 0, lastPurchaseDate: '2025-09-12', lastPurchaseAmount: 252, deadline: '2026-04-09' },
];

// === Обучення з 1С (mock — буде з Action 6 getTrainings) ===
export const MOCK_TRAININGS: Training[] = [
  { trainingId: '4471', trainingName: 'ELLANSE Step 2 "Правильна колагеностимуляція та волюметрія"', trainingType: 'Семінар', date: '2026-05-15', regionCode: 'DNP', regionName: 'Дніпро', city: '01.Дніпро' },
  { trainingId: '4472', trainingName: 'Petaran. Базовий курс ін\'єкційних технік', trainingType: 'Майстер-клас', date: '2026-05-22', regionCode: 'DNP', regionName: 'Дніпро', city: '01.Дніпро' },
  { trainingId: '4473', trainingName: 'Neuramis. Робота з мімічними зморшками', trainingType: 'Семінар', date: '2026-06-05', regionCode: 'DNP', regionName: 'Дніпро', city: '01.Дніпро' },
  { trainingId: '4474', trainingName: 'EXOXE. Контурна пластика', trainingType: 'Майстер-клас', date: '2026-06-12', regionCode: 'DNP', regionName: 'Дніпро', city: '01.Дніпро' },
  { trainingId: '4475', trainingName: 'Vitaran. Інноваційні протоколи', trainingType: 'Семінар', date: '2026-06-19', regionCode: 'DNP', regionName: 'Дніпро', city: '01.Дніпро' },
];

/**
 * Коефіцієнт зрізу факту: passedWD / totalWD на asOfDate.
 * Mock-фактія записана за повний місяць → множимо на цей коефіцієнт для імітації.
 * У проді буде getSalesFact(asOfDate) з 1С — реальний факт на дату.
 */
export function getFactScaleRatio(asOfDate: Date): number {
  const year = asOfDate.getFullYear();
  const month = asOfDate.getMonth();
  const totalWD = getWorkingDaysInMonth(year, month);
  if (totalWD === 0) return 0;
  const passedWD = getPassedWorkingDays(year, month, asOfDate);
  return Math.min(passedWD / totalWD, 1);
}

// === Зведені картки для дашборду менеджера ===
// v2.1: рахуємо три % через working-days. asOfDate — дата зрізу (фільтр або сьогодні).
// MOCK_SALES_FACT — це факт за повний місяць; для зрізу масштабуємо пропорційно
// до пройдених робочих днів (для демо). У проді — буде getSalesFact(asOfDate).
export function getMockTMSummaries(asOfDate: Date = new Date()): TMSummaryCard[] {
  const year = asOfDate.getFullYear();
  const month = asOfDate.getMonth();

  const totalWD = getWorkingDaysInMonth(year, month);
  const passedWD = getPassedWorkingDays(year, month, asOfDate);
  const calcPct = getMonthProgressPct(year, month, asOfDate);
  // Коефіцієнт зрізу: яку частку повного-місячного факту "відкрили" на дату
  const factScaleRatio = totalWD > 0 ? Math.min(passedWD / totalWD, 1) : 0;

  // Сума прогнозу і закриття розриву по сегменту PETARAN (для прикладу)
  // У боєвому коді — буде агрегувати всі прогнози по сегменту.
  const forecastSumByCode: Record<string, number> = {
    PETARAN: MOCK_FORECASTS_PETARAN.filter(f => !f.completed).reduce((s, f) => s + f.forecastAmount, 0),
  };
  const gapSumByCode: Record<string, number> = {
    PETARAN: MOCK_GAP_CLOSURES.filter(g => !g.completed).reduce((s, g) => s + g.potentialAmount, 0),
  };

  return MOCK_SALES_PLAN.plans.map(plan => {
    const fact = MOCK_SALES_FACT.facts.find(f => f.segmentCode === plan.segmentCode);
    const fullMonthFact = fact?.totalAmount ?? 0;
    // Масштабуємо повномісячний факт на pasedWD/totalWD — це імітація getSalesFact(asOfDate)
    const factAmount = Math.round(fullMonthFact * factScaleRatio);
    const factPct = pctOf(factAmount, plan.planAmount);

    const forecastSum = forecastSumByCode[plan.segmentCode] ?? 0;
    const gapSum = gapSumByCode[plan.segmentCode] ?? 0;
    const hasManagerPlan = forecastSum > 0 || gapSum > 0;

    const forecastPct = calcForecastPercent(factAmount, plan.planAmount, passedWD, totalWD);
    const expectedPct = hasManagerPlan
      ? calcExpectedPercent(factAmount, forecastSum, gapSum, plan.planAmount)
      : factPct;

    // Демо prev-month: ≈90% поточного факту, ≈95% поточного плану
    const prevMonthFactAmount = Math.round(factAmount * 0.9);
    const prevMonthPlanAmount = Math.round(plan.planAmount * 0.95);
    const prevMonthFactPercent = prevMonthPlanAmount > 0
      ? Math.round((prevMonthFactAmount / prevMonthPlanAmount) * 1000) / 10
      : 0;

    return {
      segmentCode: plan.segmentCode,
      segmentName: plan.segmentName,
      planAmount: plan.planAmount,
      factAmount,
      factPercent: Math.round(factPct * 100) / 100,
      calcPercent: Math.round(calcPct * 100) / 100,
      forecastPercent: Math.round(forecastPct * 100) / 100,
      expectedPercent: Math.round(expectedPct * 100) / 100,
      hasManagerPlan,
      deviationPercent: Math.round((forecastPct - calcPct) * 100) / 100,
      prevMonthFactAmount,
      prevMonthPlanAmount,
      prevMonthFactPercent,
      weightedPipeline: factAmount * 1.5,
      clientCount: fact?.clients.length ?? 0,
      status: plan.segmentCode === 'ESSE' ? 'submitted' : 'draft',
    };
  });
}

// === Mock агрегат клієнтів по категоріях (для шапки RM/Director) ===
// У проді буде агрегатом з 1С по getClientsForPlanning. Тут — стабільні mock-числа.
export interface ClientCategoryStats {
  active: { total: number; bought: number };
  sleeping: { total: number; bought: number };
  newClients: { total: number; bought: number };
  totalBought: number;
  totalClients: number;
}

/** Менеджер: приблизно 184 клієнтів */
export function getMockClientStatsManager(): ClientCategoryStats {
  const active = { total: 131, bought: 28 };
  const sleeping = { total: 45, bought: 5 };
  const newClients = { total: 8, bought: 2 };
  return {
    active, sleeping, newClients,
    totalBought: active.bought + sleeping.bought + newClients.bought,
    totalClients: active.total + sleeping.total + newClients.total,
  };
}

/** Регіон РМ: 2 менеджери Дніпро ≈ 368 клієнтів */
export function getMockClientStatsRegion(): ClientCategoryStats {
  const active = { total: 262, bought: 51 };
  const sleeping = { total: 90, bought: 9 };
  const newClients = { total: 16, bought: 4 };
  return {
    active, sleeping, newClients,
    totalBought: active.bought + sleeping.bought + newClients.bought,
    totalClients: active.total + sleeping.total + newClients.total,
  };
}

/** Уся компанія (директор): 10 менеджерів × ~184 ≈ 1840 клієнтів */
export function getMockClientStatsCompany(): ClientCategoryStats {
  const active = { total: 1310, bought: 245 };
  const sleeping = { total: 450, bought: 38 };
  const newClients = { total: 80, bought: 17 };
  return {
    active, sleeping, newClients,
    totalBought: active.bought + sleeping.bought + newClients.bought,
    totalClients: active.total + sleeping.total + newClients.total,
  };
}

// === Дані регіону для РМ ===
// v2.1: додано prevMonth* поля (порівняння з минулим місяцем на той же N-й робочий день)
function withPrevMonth(plan: number, fact: number, prevPlan: number, prevFact: number) {
  return {
    planAmount: plan,
    factAmount: fact,
    factPercent: plan > 0 ? Math.round((fact / plan) * 1000) / 10 : 0,
    prevMonthFactAmount: prevFact,
    prevMonthPlanAmount: prevPlan,
    prevMonthFactPercent: prevPlan > 0 ? Math.round((prevFact / prevPlan) * 1000) / 10 : 0,
  };
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

export const MOCK_REGION_DATA: RegionDataResponse = {
  regionName: 'Дніпро',
  regionCode: 'DNP',
  asOfDate: TODAY_ISO,
  prevMonthAsOfDate: '2026-03-17',
  managers: [
    {
      login: 'feshchenko@emet.com',
      name: 'Фещенко Олена',
      totalPrevMonthFact: 9100,
      segments: [
        { segmentCode: 'PETARAN', segmentName: 'Petaran', ...withPrevMonth(3745, 189, 3500, 320) },
        { segmentCode: 'ELLANSE', segmentName: 'Ellanse', ...withPrevMonth(4982, 1830, 4700, 1500) },
        { segmentCode: 'EXOXE', segmentName: 'EXOXE', ...withPrevMonth(1521, 85, 1450, 70) },
        { segmentCode: 'ESSE', segmentName: 'ESSE', ...withPrevMonth(2480, 1369, 2350, 1100) },
        { segmentCode: 'NEURAMIS', segmentName: 'Neuramis', ...withPrevMonth(2627, 369, 2500, 420) },
        { segmentCode: 'NEURONOX', segmentName: 'Neuronox', ...withPrevMonth(7226, 968, 6900, 1100) },
        { segmentCode: 'VITARAN', segmentName: 'Vitaran', ...withPrevMonth(14391, 2606, 13800, 2900) },
        { segmentCode: 'IUSE', segmentName: 'IUSE', ...withPrevMonth(2500, 160, 2400, 180) },
        { segmentCode: 'OTHER', segmentName: 'Інші ТМ', ...withPrevMonth(6153, 1430, 5900, 1690) },
      ],
    },
    {
      login: 'sirik@emet.com',
      name: 'Сірик Наталія',
      totalPrevMonthFact: 8200,
      segments: [
        { segmentCode: 'PETARAN', segmentName: 'Petaran', ...withPrevMonth(3745, 189, 3600, 250) },
        { segmentCode: 'ELLANSE', segmentName: 'Ellanse', ...withPrevMonth(4981, 1828, 4750, 1380) },
        { segmentCode: 'EXOXE', segmentName: 'EXOXE', ...withPrevMonth(1521, 85, 1500, 95) },
        { segmentCode: 'ESSE', segmentName: 'ESSE', ...withPrevMonth(2480, 1369, 2400, 1250) },
        { segmentCode: 'NEURAMIS', segmentName: 'Neuramis', ...withPrevMonth(2627, 369, 2550, 290) },
        { segmentCode: 'NEURONOX', segmentName: 'Neuronox', ...withPrevMonth(7226, 967, 7100, 980) },
        { segmentCode: 'VITARAN', segmentName: 'Vitaran', ...withPrevMonth(14391, 2606, 14200, 2400) },
        { segmentCode: 'IUSE', segmentName: 'IUSE', ...withPrevMonth(2500, 145, 2400, 130) },
        { segmentCode: 'OTHER', segmentName: 'Інші ТМ', ...withPrevMonth(6153, 1430, 6050, 1555) },
      ],
    },
  ],
};

// === Фіксовані дані регіонів для директора (без Math.random) ===
// Старі виклики передають по 2 числа на сегмент (plan, fact). Якщо prev-month відсутній —
// генеруємо приблизний минулий місяць з коефіцієнтами (для демо).
function makeSegments(base: number[]) {
  return SEGMENTS.map((s, i) => {
    const plan = base[i * 2] ?? 5000;
    const fact = base[i * 2 + 1] ?? 1000;
    // Демо: минулий місяць ≈ 95% поточного плану, факт ≈ 90% поточного факту
    const prevPlan = Math.round(plan * 0.95);
    const prevFact = Math.round(fact * 0.9);
    return {
      segmentCode: s.code,
      segmentName: s.name,
      planAmount: plan,
      factAmount: fact,
      factPercent: plan > 0 ? Math.round((fact / plan) * 1000) / 10 : 0,
      prevMonthFactAmount: prevFact,
      prevMonthPlanAmount: prevPlan,
      prevMonthFactPercent: prevPlan > 0 ? Math.round((prevFact / prevPlan) * 1000) / 10 : 0,
    };
  });
}

export const MOCK_ALL_REGIONS: RegionSummary[] = [
  MOCK_REGION_DATA,
  {
    regionName: 'Київ', regionCode: 'KYV',
    managers: [
      { login: 'm1@emet.com', name: 'Коваленко Ірина', segments: makeSegments([8500, 2100, 12000, 4400, 4200, 890, 6100, 3350, 7800, 1900, 15200, 4100, 18000, 5600, 9200, 2800]) },
      { login: 'm2@emet.com', name: 'Бондаренко Олег', segments: makeSegments([7200, 1600, 9800, 3200, 3800, 720, 5400, 2800, 6500, 1400, 13800, 3600, 16500, 4200, 8100, 2100]) },
      { login: 'm3@emet.com', name: 'Савченко Марія', segments: makeSegments([6800, 1900, 11200, 5100, 3500, 950, 4800, 2100, 5900, 1650, 12400, 3900, 15200, 4800, 7600, 2400]) },
    ],
  },
  {
    regionName: 'Одеса', regionCode: 'ODS',
    managers: [
      { login: 'm4@emet.com', name: 'Мельник Тетяна', segments: makeSegments([5200, 1100, 8400, 2800, 2800, 560, 4200, 1900, 5100, 1200, 10800, 2900, 13500, 3400, 6200, 1800]) },
      { login: 'm5@emet.com', name: 'Шевченко Дмитро', segments: makeSegments([4800, 980, 7600, 2400, 2500, 480, 3800, 1650, 4600, 1050, 9500, 2500, 12200, 3100, 5800, 1500]) },
    ],
  },
  {
    regionName: 'Львів', regionCode: 'LVV',
    managers: [
      { login: 'm6@emet.com', name: 'Гончарук Олена', segments: makeSegments([4500, 1250, 7200, 2900, 2200, 650, 3600, 1800, 4200, 980, 8900, 2800, 11200, 3600, 5200, 1650]) },
    ],
  },
  {
    regionName: 'Харків', regionCode: 'KHK',
    managers: [
      { login: 'm7@emet.com', name: 'Лисенко Андрій', segments: makeSegments([6200, 1400, 9200, 3100, 3200, 710, 4600, 2200, 5800, 1350, 11800, 3200, 14800, 4100, 7100, 2100]) },
      { login: 'm8@emet.com', name: 'Кравченко Юлія', segments: makeSegments([5800, 1250, 8800, 2800, 3000, 620, 4200, 1900, 5400, 1200, 11200, 2900, 14200, 3800, 6800, 1950]) },
    ],
  },
  {
    regionName: 'Запоріжжя', regionCode: 'ZPR',
    managers: [
      { login: 'm9@emet.com', name: 'Кулик Ольга', segments: makeSegments([4200, 950, 6800, 2200, 2400, 510, 3500, 1700, 4100, 920, 8500, 2400, 10500, 2900, 5100, 1450]) },
    ],
  },
  {
    regionName: 'Вінниця', regionCode: 'VNN',
    managers: [
      { login: 'm10@emet.com', name: 'Петренко Сергій', segments: makeSegments([3800, 850, 5800, 1900, 2100, 440, 3100, 1450, 3700, 820, 7500, 2100, 9200, 2500, 4500, 1280]) },
    ],
  },
];
