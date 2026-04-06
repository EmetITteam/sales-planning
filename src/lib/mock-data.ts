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

// === Закриття розриву (неактивні — сплячі, втрачені, БЗ) ===
export const MOCK_GAP_CLOSURES: GapClosureRow[] = [
  { clientId1c: 'C101', clientName: 'Астровська Катерина Юріївна', category: 'Сплячий', potentialAmount: 378, action: 'зідвон, продаж акції', deadline: '2026-04-07', factAmount: 0, lastPurchaseDate: '2025-11-10', lastPurchaseAmount: 378 },
  { clientId1c: 'C102', clientName: 'Булдакова Регіна', category: 'Сплячий', potentialAmount: 252, action: 'зідвон, нагадування', deadline: '2026-04-07', factAmount: 0, lastPurchaseDate: '2025-10-05', lastPurchaseAmount: 252 },
  { clientId1c: 'C103', clientName: 'Вакуленко Катерина Олексіївна', category: 'Втрачений', potentialAmount: 378, action: 'зідвон, продаж акції', deadline: '2026-04-08', factAmount: 378, lastPurchaseDate: '2025-06-15', lastPurchaseAmount: 378 },
  { clientId1c: 'C104', clientName: 'Дячок Олена Олексіївна', category: 'БЗ', potentialAmount: 378, action: 'презентація', deadline: '2026-04-08', factAmount: 0, lastPurchaseDate: '2025-08-20', lastPurchaseAmount: 252 },
  { clientId1c: 'C105', clientName: 'Калина Ольга Сергіївна', category: 'Сплячий', potentialAmount: 252, action: 'зідвон, продаж акції', deadline: '2026-04-09', factAmount: 0, lastPurchaseDate: '2025-09-12', lastPurchaseAmount: 252 },
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

// === Фіксовані дані регіонів для директора (без Math.random) ===
function makeSegments(base: number[]): { segmentCode: string; segmentName: string; planAmount: number; factAmount: number; factPercent: number }[] {
  return SEGMENTS.map((s, i) => {
    const plan = base[i * 2] ?? 5000;
    const fact = base[i * 2 + 1] ?? 1000;
    return { segmentCode: s.code, segmentName: s.name, planAmount: plan, factAmount: fact, factPercent: plan > 0 ? Math.round((fact / plan) * 1000) / 10 : 0 };
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
];
