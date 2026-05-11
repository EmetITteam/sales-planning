// Тести охорони auto-populate у planning-form.tsx.
// Сценарій бага: менеджер видалив усіх → save → перемкнув дату →
// видалені клієнти повертались бо auto-populate думав "перше відкриття".
//
// Це не той самий код-шлях що тестується — формула проста і легко покриваються
// усі гілки. Тестуємо логіку гарду через симульований state.

import test from 'node:test';
import assert from 'node:assert/strict';

interface AutoPopulateState {
  supabaseLoaded: boolean;
  formEverEdited: boolean;   // period_summaries record існує АБО save щойно відбувся
  forecastsLength: number;
  activeClientsLength: number;
}

/** Точно та сама логіка що в useEffect-ах planning-form.tsx (active + sleeping). */
function shouldAutoPopulate(s: AutoPopulateState): boolean {
  if (!s.supabaseLoaded) return false;
  if (s.formEverEdited) return false; // <-- ключовий гард, fix цієї сесії
  if (s.forecastsLength > 0) return false;
  if (s.activeClientsLength === 0) return false;
  return true;
}

test('перше відкриття форми (нема save) → auto-populate спрацьовує', () => {
  const state: AutoPopulateState = {
    supabaseLoaded: true,
    formEverEdited: false,
    forecastsLength: 0,
    activeClientsLength: 5,
  };
  assert.equal(shouldAutoPopulate(state), true);
});

test('Supabase ще не завантажилась → auto-populate чекає', () => {
  const state: AutoPopulateState = {
    supabaseLoaded: false,
    formEverEdited: false,
    forecastsLength: 0,
    activeClientsLength: 5,
  };
  assert.equal(shouldAutoPopulate(state), false);
});

test('forecasts вже є (Supabase повернула збережене) → auto-populate skip', () => {
  const state: AutoPopulateState = {
    supabaseLoaded: true,
    formEverEdited: true,
    forecastsLength: 5,
    activeClientsLength: 5,
  };
  assert.equal(shouldAutoPopulate(state), false);
});

test('Active clients = 0 (1С не повернула) → auto-populate skip', () => {
  const state: AutoPopulateState = {
    supabaseLoaded: true,
    formEverEdited: false,
    forecastsLength: 0,
    activeClientsLength: 0,
  };
  assert.equal(shouldAutoPopulate(state), false);
});

// === КЛЮЧОВИЙ СЦЕНАРІЙ ===
test('менеджер видалив усіх + save + перемкнув дату → НЕ повертати клієнтів', () => {
  // 1. Перше відкриття: auto-populate додав 5 активних
  // 2. Менеджер видалив усіх через bulk-delete → forecasts.length=0
  // 3. Save → backend створює period_summaries record
  // 4. Менеджер перемкнув дату → форма перезавантажується
  // 5. Supabase load: forecasts=[], summary != null → formEverEdited=true
  const state: AutoPopulateState = {
    supabaseLoaded: true,
    formEverEdited: true,        // <-- ключове: period_summaries існує
    forecastsLength: 0,           // forecasts реально пусті у БД
    activeClientsLength: 5,       // 1С повертає активних
  };
  // Раніше тут було б TRUE → клієнти поверталися. Тепер FALSE — фікс.
  assert.equal(shouldAutoPopulate(state), false,
    'видалені клієнти НЕ повертаються після save+перемикання');
});

test('save в поточній сесії → setFormEverEdited(true) → auto-populate більше не спрацьовує', () => {
  // Сценарій без перемикання дати: менеджер видалив, зберіг, потім чекає.
  // formEverEdited тепер true (handleSave його ставить).
  const stateBefore: AutoPopulateState = {
    supabaseLoaded: true,
    formEverEdited: false,  // ще не зберігав
    forecastsLength: 0,
    activeClientsLength: 5,
  };
  assert.equal(shouldAutoPopulate(stateBefore), true, 'до save: auto-populate ОК');

  const stateAfter: AutoPopulateState = {
    ...stateBefore,
    formEverEdited: true,   // після save
  };
  assert.equal(shouldAutoPopulate(stateAfter), false, 'після save: auto-populate skip');
});
