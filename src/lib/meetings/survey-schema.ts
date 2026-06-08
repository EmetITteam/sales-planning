/**
 * Survey schema — анкета потенціалу клієнта.
 *
 * Структура 1-в-1 з meeting-app/index.html (4 секції accordion). Дані
 * зберігаються як вкладений об'єкт за path `data-question` (наприклад
 * "Портфель.ботулінотерапія.Бренди") — це формат що шле 1С action
 * `saveClientSurvey({clientID, surveyData})`.
 *
 * Анкета по КЛІЄНТУ (не по зустрічі): зберігається у 1С як AnketaDataJSON
 * самого клієнта, тому при відкритті зустрічі цього клієнта дані префіл'яться
 * з попереднього заповнення.
 */

export type FieldKind = 'radio' | 'checkbox' | 'textarea';

export interface SurveyOption {
  value: string;
  label: string;
  /** Якщо опція тригерить розкриття sub-блоку — id sub-блоку */
  controls?: string;
}

export interface SurveyField {
  kind: FieldKind;
  /** Path у data: ['Портфель', 'ботулінотерапія', 'Бренди']  */
  path: string[];
  label: string;
  /** radio-група: одна назва на всі options. checkbox: кожна окремо. */
  groupName?: string;
  options?: SurveyOption[];
  /** rows для textarea */
  rows?: number;
}

export interface SurveySubBlock {
  /** id — той же що SurveyOption.controls */
  id: string;
  fields: SurveyField[];
}

export interface SurveySection {
  title: string;
  fields: SurveyField[];
  /** Sub-блоки що показуються при checkbox-тригері */
  subBlocks?: SurveySubBlock[];
}

const QTY_OPTIONS_5: SurveyOption[] = [
  { value: 'до 3-х', label: 'до 3-х' },
  { value: 'від 3-х до 5', label: 'від 3-х до 5' },
  { value: 'більше 5', label: 'більше 5' },
];
const QTY_OPTIONS_10: SurveyOption[] = [...QTY_OPTIONS_5, { value: 'більше 10', label: 'більше 10' }];

const PRODUCT_OBSTACLES_FIELDS = (productKey: string): SurveyField[] => [
  {
    kind: 'textarea',
    path: ['Наступні кроки', 'Деталі', productKey, 'вирішувані'],
    label: 'Що заважає почати працювати з цим продуктом (можливі для вирішення):',
    rows: 2,
  },
  {
    kind: 'textarea',
    path: ['Наступні кроки', 'Деталі', productKey, 'невирішувані'],
    label: 'Що заважає почати працювати з цим продуктом (неможливі для вирішення):',
    rows: 2,
  },
];

export const SURVEY_SECTIONS: SurveySection[] = [
  // ============================================================================
  // 1. Загальна інформація
  // ============================================================================
  {
    title: '1. Загальна інформація про практику',
    fields: [
      {
        kind: 'radio',
        path: ['Общая информация', 'Стаж работы'],
        label: 'Стаж роботи в естетичній медицині/косметології:',
        groupName: 'experience',
        options: [
          { value: 'до 3-х років', label: 'до 3-х років' },
          { value: 'від 3-х до 5 років', label: 'від 3-х до 5 років' },
          { value: 'більше 5 років', label: 'більше 5 років' },
        ],
      },
      {
        kind: 'radio',
        path: ['Общая информация', 'Кількість пацієнтів'],
        label: 'Середня кількість пацієнтів на місяць:',
        groupName: 'patients_count',
        options: [
          { value: 'до 10', label: 'до 10' },
          { value: '10-20', label: '10-20' },
          { value: '20-30', label: '20-30' },
          { value: 'більше 30', label: 'більше 30' },
        ],
      },
      {
        kind: 'checkbox',
        path: ['Общая информация', 'Тип практики'],
        label: 'Працює:',
        options: [
          { value: 'Працює на себе', label: 'Працює на себе' },
          { value: 'У клініці найманий фахівець', label: 'У клініці найманий фахівець' },
          { value: 'Власник та/або керівник клініки', label: 'Власник та/або керівник клініки' },
        ],
      },
    ],
  },

  // ============================================================================
  // 2. Портфель і обсяги
  // ============================================================================
  {
    title: '2. Портфель і обсяги',
    fields: [
      {
        kind: 'checkbox',
        path: ['Портфель', 'Процедури'],
        label: 'Які процедури виконує:',
        options: [
          { value: 'ботулінотерапія', label: 'ботулінотерапія', controls: 'botulinum-details' },
          { value: 'біоревіталізація', label: 'біоревіталізація', controls: 'boosters-details' },
          { value: 'біорепарація PDRN', label: 'біорепарація PDRN', controls: 'pdrn-details' },
          { value: 'контурна пластика філерами', label: 'контурна пластика філерами', controls: 'fillers-details' },
          { value: 'колагеностимуляція', label: 'колагеностимуляція (PLLA, PCL, HaCa)', controls: 'collagen-details' },
          { value: 'екзосоми', label: 'екзосоми', controls: 'exosomes-details' },
          { value: 'робота зі шкірою голови', label: 'робота зі шкірою голови', controls: 'hair-details' },
          { value: 'продаж домашнього догляду', label: 'продаж домашнього догляду', controls: 'home-care-details' },
          { value: 'доглядові косметичні процедури', label: 'доглядові косметичні процедури (пілінги, чистка)' },
          { value: 'апаратна косметологія', label: 'апаратна косметологія' },
        ],
      },
    ],
    subBlocks: [
      {
        id: 'botulinum-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'ботулінотерапія', 'Бренди'],
            label: 'Який ботулотоксин використовує:',
            options: ['Neuronox', 'Dysport', 'Botox', 'Xeomin', 'Nabota', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'ботулінотерапія', 'Кількість'],
            label: 'Скільки флаконів використовує на місяць:',
            groupName: 'botulinum_qty',
            options: QTY_OPTIONS_5,
          },
        ],
      },
      {
        id: 'boosters-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'біоревіталізація', 'Бренди'],
            label: 'Які бустери використовує:',
            options: ['IUSE Skin Booster', 'RRS', 'Jalupro', 'Profhilo', 'Revok50', 'Bolotero Revive', 'Hyalual', 'Juvederm Volite', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'біоревіталізація', 'Кількість'],
            label: 'Скільки шприців на місяць:',
            groupName: 'boosters_qty',
            options: QTY_OPTIONS_5,
          },
        ],
      },
      {
        id: 'pdrn-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'PDRN', 'Бренди'],
            label: 'Які препарати PDRN використовує:',
            options: ['Vitaran', 'Rejuran', 'Plenhyage', 'MASTELLI Plinest', 'TWAC', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'PDRN', 'Кількість'],
            label: 'Скільки одиниць PDRN на місяць:',
            groupName: 'pdrn_qty',
            options: QTY_OPTIONS_10,
          },
        ],
      },
      {
        id: 'fillers-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'філери', 'Бренди'],
            label: 'Які філери використовує:',
            options: ['Neuramis', 'Saypha', 'Restylane', 'Juvederm', 'Teoxane', 'Bolotero', 'Stylage', 'Neauvia', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'філери', 'Кількість'],
            label: 'Скільки одиниць філерів на місяць:',
            groupName: 'fillers_qty',
            options: QTY_OPTIONS_5,
          },
        ],
      },
      {
        id: 'collagen-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'колагеностимуляція', 'Бренди'],
            label: 'Які препарати для колагеностимуляції:',
            options: ['Petaran', 'Ellanse', 'GANA', 'Radiesse', 'HarmonyCa', 'Karisma', 'Lenisna', 'Juvelook', 'AesPlla', 'Gouri', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'колагеностимуляція', 'Кількість'],
            label: 'Скільки упаковок на місяць:',
            groupName: 'collagen_qty',
            options: QTY_OPTIONS_10,
          },
        ],
      },
      {
        id: 'exosomes-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'екзосоми', 'Бренди'],
            label: 'Які екзосоми використовує:',
            options: ['EXOXE', 'EXO-SKIN (ТОТИС)', 'eXos Antiaging (ТОТИС)', 'GoodEXOcells', 'ASCE+ (ААА)', 'REVIVE NX', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'екзосоми', 'Кількість'],
            label: 'Скільки флаконів на місяць:',
            groupName: 'exosomes_qty',
            options: QTY_OPTIONS_5,
          },
        ],
      },
      {
        id: 'hair-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'робота зі шкірою голови', 'Бренди'],
            label: 'Які препарати для відновлення росту волосся:',
            options: ['DR.CYJ Hair Filler', 'RRS Hair', 'IUSE Hair', 'Dermaheal Hair', 'препарати на основі PDRN', 'препарати на основі екзосомів', 'Інше'].map(v => ({ value: v, label: v })),
          },
          {
            kind: 'radio',
            path: ['Портфель', 'робота зі шкірою голови', 'Кількість'],
            label: 'Скільки одиниць на місяць:',
            groupName: 'hair_qty',
            options: QTY_OPTIONS_5,
          },
        ],
      },
      {
        id: 'home-care-details',
        fields: [
          {
            kind: 'checkbox',
            path: ['Портфель', 'домашній догляд', 'Бренди'],
            label: 'Яку космецевтику продає у домашній догляд:',
            options: ['ESSE', 'Medik8', 'IsClinical', 'ZO OBAGI', 'Instytutum', 'Resens', 'Аптечний сегмент', 'Інше'].map(v => ({ value: v, label: v })),
          },
        ],
      },
    ],
  },

  // ============================================================================
  // 3. Навчання та розвиток
  // ============================================================================
  {
    title: '3. Навчання та розвиток',
    fields: [
      {
        kind: 'checkbox',
        path: ['Навчання', 'Форма'],
        label: 'Якій формі навчання надаєте перевагу:',
        options: ['Онлайн-навчання', 'Офлайн семінари', 'Конференції'].map(v => ({ value: v, label: v })),
      },
    ],
  },

  // ============================================================================
  // 4. Наступні кроки
  // ============================================================================
  {
    title: '4. Наступні кроки',
    fields: [
      {
        kind: 'checkbox',
        path: ['Наступні кроки', 'Цікаві продукти'],
        label: 'Які продукти з портфелю ЕМЕТ з якими фахівець не працює цікавлять його найбільше?',
        options: [
          { value: 'Ellanse', label: 'Ellanse', controls: 'details-ellanse' },
          { value: 'Petaran', label: 'Petaran', controls: 'details-petaran' },
          { value: 'Neuronox', label: 'Neuronox', controls: 'details-neuronox' },
          { value: 'Neuramis', label: 'Neuramis', controls: 'details-neuramis' },
          { value: 'Vitaran', label: 'Vitaran', controls: 'details-vitaran' },
          { value: 'EXOXE', label: 'EXOXE', controls: 'details-exoxe' },
          { value: 'IUSE Skin Booster', label: 'IUSE Skin Booster', controls: 'details-iuse-skin' },
          { value: 'IUSE Hair', label: 'IUSE Hair', controls: 'details-iuse-hair' },
          { value: 'ESSE', label: 'ESSE', controls: 'details-esse' },
          { value: 'БАДи', label: 'БАДи', controls: 'details-bady' },
        ],
      },
      {
        kind: 'checkbox',
        path: ['Наступні кроки', 'Спосіб звʼязку'],
        label: 'Переважний спосіб отримання інформації:',
        options: ['Телефонний дзвінок', 'Viber', 'Telegram', 'Email', 'Візит менеджера'].map(v => ({ value: v, label: v })),
      },
    ],
    subBlocks: [
      { id: 'details-ellanse', fields: PRODUCT_OBSTACLES_FIELDS('Ellanse') },
      { id: 'details-petaran', fields: PRODUCT_OBSTACLES_FIELDS('Petaran') },
      { id: 'details-neuronox', fields: PRODUCT_OBSTACLES_FIELDS('Neuronox') },
      { id: 'details-neuramis', fields: PRODUCT_OBSTACLES_FIELDS('Neuramis') },
      { id: 'details-vitaran', fields: PRODUCT_OBSTACLES_FIELDS('Vitaran') },
      { id: 'details-exoxe', fields: PRODUCT_OBSTACLES_FIELDS('EXOXE') },
      { id: 'details-iuse-skin', fields: PRODUCT_OBSTACLES_FIELDS('IUSE Skin Booster') },
      { id: 'details-iuse-hair', fields: PRODUCT_OBSTACLES_FIELDS('IUSE Hair') },
      { id: 'details-esse', fields: PRODUCT_OBSTACLES_FIELDS('ESSE') },
      { id: 'details-bady', fields: PRODUCT_OBSTACLES_FIELDS('БАДи') },
    ],
  },
];

// ============================================================================
// Data manipulation helpers
// ============================================================================

export type SurveyData = Record<string, unknown>;

/** Безпечно set значення за path. Створює вкладені об'єкти при потребі. */
export function setSurveyValue(data: SurveyData, path: string[], value: unknown): SurveyData {
  const result = { ...data };
  let cur: Record<string, unknown> = result;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    cur[key] = { ...((cur[key] as Record<string, unknown>) ?? {}) };
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
  return result;
}

export function getSurveyValue(data: SurveyData, path: string[]): unknown {
  let cur: unknown = data;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Toggle checkbox value у array за path. */
export function toggleArrayValue(data: SurveyData, path: string[], value: string): SurveyData {
  const arr = (getSurveyValue(data, path) as string[] | undefined) ?? [];
  const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
  return setSurveyValue(data, path, next);
}
