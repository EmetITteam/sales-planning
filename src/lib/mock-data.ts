import type {
  UserSession,
  SalesPlanResponse,
  SalesFactResponse,
  Client1C,
  RegionDataResponse,
  RegionSummary,
  ForecastRow,
  TMSummaryCard,
} from './types';

// === Тестовые пользователи ===
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

// === Сегменты (ТМ) ===
export const SEGMENTS = [
  { code: 'PETARAN', name: 'Petaran' },
  { code: 'ELLANSE', name: 'Ellanse' },
  { code: 'EXOXE', name: 'EXOXE' },
  { code: 'ESSE', name: 'ESSE' },
  { code: 'NEURAMIS', name: 'Neuramis' },
  { code: 'NEURONOX', name: 'Neuronox' },
  { code: 'VITARAN', name: 'Vitaran' },
  { code: 'OTHER', name: 'Інші ТМ' },
];

// === Планы продаж ===
export const MOCK_SALES_PLAN: SalesPlanResponse = {
  plans: [
    { segmentCode: 'PETARAN', segmentName: 'Petaran', planAmount: 7490, currency: 'USD' },
    { segmentCode: 'ELLANSE', segmentName: 'Ellanse', planAmount: 9963, currency: 'USD' },
    { segmentCode: 'EXOXE', segmentName: 'EXOXE', planAmount: 3042, currency: 'USD' },
    { segmentCode: 'ESSE', segmentName: 'ESSE', planAmount: 4960, currency: 'USD' },
    { segmentCode: 'NEURAMIS', segmentName: 'Neuramis', planAmount: 5254, currency: 'USD' },
    { segmentCode: 'NEURONOX', segmentName: 'Neuronox', planAmount: 14452, currency: 'USD' },
    { segmentCode: 'VITARAN', segmentName: 'Vitaran', planAmount: 28782, currency: 'USD' },
    { segmentCode: 'OTHER', segmentName: 'Інші ТМ', planAmount: 12306, currency: 'USD' },
  ],
  exchangeRate: 41.35,
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
};

// === Факт продаж ===
export const MOCK_SALES_FACT: SalesFactResponse = {
  facts: [
    { segmentCode: 'PETARAN', totalAmount: 378, clients: [{ clientId: 'C001', clientName: 'Бліндовська Яна Олександрівна', amount: 378, lastSaleDate: '2026-03-05' }] },
    { segmentCode: 'ELLANSE', totalAmount: 3658, clients: [{ clientId: 'C010', clientName: 'Єфіменко Наталія', amount: 3000, lastSaleDate: '2026-03-04' }, { clientId: 'C011', clientName: 'Мачтакова Марина', amount: 658, lastSaleDate: '2026-03-06' }] },
    { segmentCode: 'EXOXE', totalAmount: 170, clients: [{ clientId: 'C020', clientName: 'Ворошилова Елена', amount: 170, lastSaleDate: '2026-03-07' }] },
    { segmentCode: 'ESSE', totalAmount: 2738, clients: [{ clientId: 'C030', clientName: 'Клініка Гіппократ', amount: 540, lastSaleDate: '2026-03-06' }, { clientId: 'C031', clientName: 'Одінцова Інна', amount: 525, lastSaleDate: '2026-03-05' }, { clientId: 'C032', clientName: 'Красуля Олена', amount: 1673, lastSaleDate: '2026-03-07' }] },
    { segmentCode: 'NEURAMIS', totalAmount: 738, clients: [{ clientId: 'C040', clientName: 'Перекрест Катерина', amount: 69, lastSaleDate: '2026-03-04' }, { clientId: 'C041', clientName: 'Миронова Яна', amount: 669, lastSaleDate: '2026-03-06' }] },
    { segmentCode: 'NEURONOX', totalAmount: 1935, clients: [{ clientId: 'C050', clientName: 'Клініка Гіппократ', amount: 540, lastSaleDate: '2026-03-06' }, { clientId: 'C051', clientName: 'Тараненко Альона', amount: 285, lastSaleDate: '2026-03-05' }, { clientId: 'C052', clientName: 'Федоренко Надія', amount: 285, lastSaleDate: '2026-03-05' }, { clientId: 'C053', clientName: 'Посунько Юлія', amount: 380, lastSaleDate: '2026-03-06' }, { clientId: 'C054', clientName: 'Одінцова Інна', amount: 445, lastSaleDate: '2026-03-07' }] },
    { segmentCode: 'VITARAN', totalAmount: 5212, clients: [{ clientId: 'C060', clientName: 'Різні клієнти', amount: 5212, lastSaleDate: '2026-03-08' }] },
    { segmentCode: 'OTHER', totalAmount: 2860, clients: [{ clientId: 'C070', clientName: 'Різні клієнти', amount: 2860, lastSaleDate: '2026-03-08' }] },
  ],
};

// === Клиенты по сегменту (пример для Petaran) ===
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

// === Тестовые прогнозы для Petaran ===
export const MOCK_FORECASTS_PETARAN: ForecastRow[] = [
  { clientId1c: 'C002', clientName: 'Андрущук Катерина Миколаївна', clientType: 'active', forecastAmount: 378, probability: 30, dealStage: 'зідзвон до 13.03, продаж акції', nextStep: 'поки не планує замовляти, приїде 8 квітня', risk: 'працює закордоном, залежить від перевізника' },
  { clientId1c: 'C003', clientName: 'Гімішлі Анастасія Миколаївна', clientType: 'active', forecastAmount: 252, probability: 30, dealStage: 'зідзвон до 13.03, продаж акції', nextStep: 'запросити на навчання 24.03 під закупку 2х флаконів', risk: 'мало працює колагеностимуляторами' },
  { clientId1c: 'C004', clientName: 'Головатая Алла', clientType: 'active', forecastAmount: 252, probability: 30, dealStage: 'зідзвон до 13.03, продаж акції', nextStep: 'запросити на навчання 24.03 під закупку 2х флаконів', risk: 'працює закордоном, раз на місяць приїзджає' },
  { clientId1c: 'C005', clientName: 'Календа Марина', clientType: 'active', forecastAmount: 252, probability: 30, dealStage: 'зідзвон до 13.03, продаж акції', nextStep: 'запросити на навчання 24.03 під закупку 2х флаконів', risk: 'купила 5 флаконів, падкая на акції' },
  { clientId1c: 'C008', clientName: 'Ліпунова Аліна Олександрівна', clientType: 'active', forecastAmount: 378, probability: 30, dealStage: '13.03 зідзвон і продаж акції', nextStep: 'запросити на навчання 24.03', risk: 'може замовити у конкурентів' },
  { clientId1c: 'C001', clientName: 'Бліндовська Яна Олександрівна', clientType: 'active', forecastAmount: 378, probability: 100, dealStage: 'купила акцію', nextStep: '', risk: '' },
  { clientId1c: 'C009', clientName: 'Воронько Катерина Олександрівна', clientType: 'active', forecastAmount: 595, probability: 30, dealStage: 'зідзвон до 13.03', nextStep: 'пропокувати купити акцію від 5 флаконів', risk: 'не відповідає на телефонні дзвінки' },
  { clientId1c: 'C100', clientName: 'Карапиш Лариса Володимирівна', clientType: 'active', forecastAmount: 378, probability: 100, dealStage: 'купила', nextStep: '', risk: '' },
];

// === Сводные карточки для дашборда менеджера ===
export function getMockTMSummaries(): TMSummaryCard[] {
  const now = new Date(2026, 2, 8); // 8 марта 2026
  const daysInMonth = 31;
  const dayOfMonth = now.getDate();
  const expectedPct = (dayOfMonth / daysInMonth) * 100;

  return MOCK_SALES_PLAN.plans.map(plan => {
    const fact = MOCK_SALES_FACT.facts.find(f => f.segmentCode === plan.segmentCode);
    const factAmount = fact?.totalAmount ?? 0;
    const factPct = plan.planAmount > 0 ? (factAmount / plan.planAmount) * 100 : 0;

    return {
      segmentCode: plan.segmentCode,
      segmentName: plan.segmentName,
      planAmount: plan.planAmount,
      factAmount,
      factPercent: Math.round(factPct * 100) / 100,
      expectedPercent: Math.round(expectedPct * 100) / 100,
      deviationPercent: Math.round((factPct - expectedPct) * 100) / 100,
      forecastPercent: 100,
      weightedPipeline: factAmount * 1.5,
      clientCount: fact?.clients.length ?? 0,
      status: plan.segmentCode === 'ESSE' ? 'submitted' : 'draft',
    };
  });
}

// === Данные региона для РМ ===
export const MOCK_REGION_DATA: RegionDataResponse = {
  regionName: 'Дніпро',
  regionCode: 'DNP',
  managers: [
    {
      login: 'feshchenko@emet.com',
      name: 'Фещенко Олена',
      segments: [
        { segmentCode: 'PETARAN', segmentName: 'Petaran', planAmount: 3745, factAmount: 189, factPercent: 5.05 },
        { segmentCode: 'ELLANSE', segmentName: 'Ellanse', planAmount: 4982, factAmount: 1830, factPercent: 36.72 },
        { segmentCode: 'EXOXE', segmentName: 'EXOXE', planAmount: 1521, factAmount: 85, factPercent: 5.59 },
        { segmentCode: 'ESSE', segmentName: 'ESSE', planAmount: 2480, factAmount: 1369, factPercent: 55.2 },
        { segmentCode: 'NEURAMIS', segmentName: 'Neuramis', planAmount: 2627, factAmount: 369, factPercent: 14.05 },
        { segmentCode: 'NEURONOX', segmentName: 'Neuronox', planAmount: 7226, factAmount: 968, factPercent: 13.39 },
        { segmentCode: 'VITARAN', segmentName: 'Vitaran', planAmount: 14391, factAmount: 2606, factPercent: 18.11 },
        { segmentCode: 'OTHER', segmentName: 'Інші ТМ', planAmount: 6153, factAmount: 1430, factPercent: 23.23 },
      ],
    },
    {
      login: 'sirik@emet.com',
      name: 'Сірик Наталія',
      segments: [
        { segmentCode: 'PETARAN', segmentName: 'Petaran', planAmount: 3745, factAmount: 189, factPercent: 5.05 },
        { segmentCode: 'ELLANSE', segmentName: 'Ellanse', planAmount: 4981, factAmount: 1828, factPercent: 36.70 },
        { segmentCode: 'EXOXE', segmentName: 'EXOXE', planAmount: 1521, factAmount: 85, factPercent: 5.59 },
        { segmentCode: 'ESSE', segmentName: 'ESSE', planAmount: 2480, factAmount: 1369, factPercent: 55.2 },
        { segmentCode: 'NEURAMIS', segmentName: 'Neuramis', planAmount: 2627, factAmount: 369, factPercent: 14.05 },
        { segmentCode: 'NEURONOX', segmentName: 'Neuronox', planAmount: 7226, factAmount: 967, factPercent: 13.38 },
        { segmentCode: 'VITARAN', segmentName: 'Vitaran', planAmount: 14391, factAmount: 2606, factPercent: 18.11 },
        { segmentCode: 'OTHER', segmentName: 'Інші ТМ', planAmount: 6153, factAmount: 1430, factPercent: 23.23 },
      ],
    },
  ],
};

// === Данные всех регионов для директора ===
export const MOCK_ALL_REGIONS: RegionSummary[] = [
  MOCK_REGION_DATA,
  {
    regionName: 'Київ', regionCode: 'KYV',
    managers: [
      { login: 'm1@emet.com', name: 'Коваленко Ірина', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 15000 + 3000), factAmount: Math.round(Math.random() * 8000 + 500), factPercent: Math.round(Math.random() * 40 + 5) })) },
      { login: 'm2@emet.com', name: 'Бондаренко Олег', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 15000 + 3000), factAmount: Math.round(Math.random() * 8000 + 500), factPercent: Math.round(Math.random() * 40 + 5) })) },
      { login: 'm3@emet.com', name: 'Савченко Марія', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 15000 + 3000), factAmount: Math.round(Math.random() * 8000 + 500), factPercent: Math.round(Math.random() * 40 + 5) })) },
    ],
  },
  {
    regionName: 'Одеса', regionCode: 'ODS',
    managers: [
      { login: 'm4@emet.com', name: 'Мельник Тетяна', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 12000 + 2000), factAmount: Math.round(Math.random() * 6000 + 300), factPercent: Math.round(Math.random() * 35 + 8) })) },
      { login: 'm5@emet.com', name: 'Шевченко Дмитро', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 12000 + 2000), factAmount: Math.round(Math.random() * 6000 + 300), factPercent: Math.round(Math.random() * 35 + 8) })) },
    ],
  },
  {
    regionName: 'Львів', regionCode: 'LVV',
    managers: [
      { login: 'm6@emet.com', name: 'Гончарук Олена', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 10000 + 2000), factAmount: Math.round(Math.random() * 5000 + 200), factPercent: Math.round(Math.random() * 30 + 10) })) },
    ],
  },
  {
    regionName: 'Харків', regionCode: 'KHK',
    managers: [
      { login: 'm7@emet.com', name: 'Лисенко Андрій', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 13000 + 3000), factAmount: Math.round(Math.random() * 7000 + 500), factPercent: Math.round(Math.random() * 45 + 3) })) },
      { login: 'm8@emet.com', name: 'Кравченко Юлія', segments: SEGMENTS.map(s => ({ segmentCode: s.code, segmentName: s.name, planAmount: Math.round(Math.random() * 13000 + 3000), factAmount: Math.round(Math.random() * 7000 + 500), factPercent: Math.round(Math.random() * 45 + 3) })) },
    ],
  },
];
