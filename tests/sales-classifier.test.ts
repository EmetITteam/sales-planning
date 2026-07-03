// Тести класифікатора продажів — ЄДИНЕ джерело правил бренд/канал/подарунок для
// backfill і live-sync. Якщо правила «попливуть» — цифри на «Стратегії» поплили.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBrand,
  detectChannel,
  isIgnoredProduct,
  isExcludedDiscount,
  isAmbassador,
  isGiftInDiscount,
  detectGiftBrand,
  classifySale,
  UNMAPPED_BRAND,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — імпорт з .ts
} from '../src/lib/strategic-kpi/sales-classifier.ts';

// === detectBrand ===
test('detectBrand — основні бренди', () => {
  assert.equal(detectBrand('HP CELL VITARAN i 2.0 (2*2.5ml)'), 'Vitaran');
  assert.equal(detectBrand('Neuronox 100U'), 'Neuronox');
  assert.equal(detectBrand('Ботулотоксин типу А'), 'Neuronox');
  assert.equal(detectBrand('ELLANSE S 2x1ml'), 'Ellanse');
  assert.equal(detectBrand('PETARAN Rejuran'), 'Petaran');
  assert.equal(detectBrand('NEURAMIS Deep Lidocaine'), 'Neuramis');
});

test('detectBrand — IUSE підбренди (специфічні першими)', () => {
  assert.equal(detectBrand('IUSE Marine Collagen'), 'IUSE Coll.');
  assert.equal(detectBrand('Marine Collagen'), 'IUSE Coll.');
  assert.equal(detectBrand('IUSE Skin Booster'), 'IUSE SB');
  assert.equal(detectBrand('Skin Booster IUSE'), 'IUSE SB');
  assert.equal(detectBrand('IUSE hair complex'), 'IUSE hair');
});

test('detectBrand — ESSE / БАД / EXOXE', () => {
  assert.equal(detectBrand('C5.ESSE Serum'), 'ESSE');
  assert.equal(detectBrand('ESSE Cream Rich'), 'ESSE');
  assert.equal(detectBrand('MAGNOX капсули'), 'БАД');
  assert.equal(detectBrand('EXOXE 2ml'), 'EXOXE');
});

test('detectBrand — невідомий товар → null', () => {
  assert.equal(detectBrand('Канюля 25G 50mm'), null);
  assert.equal(detectBrand('Якийсь невідомий товар'), null);
});

// === detectChannel ===
test('detectChannel — колл-центр vs представництва', () => {
  assert.equal(detectChannel('Коллцентр Call center лидогенерация'), 'call_center');
  assert.equal(detectChannel('call-center'), 'call_center');
  assert.equal(detectChannel('Киев'), 'representatives');
  assert.equal(detectChannel('Одесса'), 'representatives');
  assert.equal(detectChannel('Полтава*'), 'representatives'); // дистри у sales = representatives
  assert.equal(detectChannel(''), 'representatives');
  assert.equal(detectChannel(null), 'representatives');
});

// === ignore / exclude / ambassador / gift ===
test('isIgnoredProduct — розхідники', () => {
  assert.equal(isIgnoredProduct('Канюля 25G'), true);
  assert.equal(isIgnoredProduct('Шприц 1ml'), true);
  assert.equal(isIgnoredProduct('TESTER ESSE'), true);
  assert.equal(isIgnoredProduct('Neuronox 100U'), false);
});

test('isExcludedDiscount — Реклама/ДР/Гонорар', () => {
  assert.equal(isExcludedDiscount('Рекламная продукция'), true);
  assert.equal(isExcludedDiscount('День Рождения клиента'), true);
  assert.equal(isExcludedDiscount('Гонорар лектору'), true);
  assert.equal(isExcludedDiscount('Vitaran від 4х уп. -15%'), false);
  assert.equal(isExcludedDiscount(null), false);
});

test('isAmbassador / isGiftInDiscount', () => {
  assert.equal(isAmbassador('Амбассадор бренду'), true);
  assert.equal(isAmbassador('звичайна знижка'), false);
  assert.equal(isGiftInDiscount('Подарок Vitaran (05.26)'), true);
  assert.equal(isGiftInDiscount('Подарунок Neuronox'), true);
  assert.equal(isGiftInDiscount('знижка -10%'), false);
});

test('detectGiftBrand — витягує бренд подарунка', () => {
  assert.equal(detectGiftBrand('Подарунок Neuronox'), 'Neuronox');
  assert.equal(detectGiftBrand('Подарок Ellanse S'), 'Ellanse');
  assert.equal(detectGiftBrand('Подарок невідомого'), null);
  assert.equal(detectGiftBrand('звичайна знижка'), null);
  // ⚠️ Нюанс (успадковано з backfill): голе «Vitaran» без суфікса (i/Tox/...)
  // регексом бренду НЕ ловиться → giftBrand null. Свідома faithful-поведінка.
  assert.equal(detectGiftBrand('Подарок Vitaran (05.26)'), null);
});

// === classifySale (композит — має збігатись з backfill-логікою) ===
test('classifySale — звичайний продаж', () => {
  const c = classifySale({ product: 'Neuronox 100U', discount: null, division: 'Киев', sumUsd: 315 });
  assert.deepEqual(c, {
    brand: 'Neuronox', channel: 'representatives',
    isIgnored: false, isGift: false, isExcluded: false, giftBrand: null,
  });
});

test('classifySale — подарунковий рядок (sum=0 + повод «Подарок»)', () => {
  const c = classifySale({ product: 'Neuronox 100U', discount: 'Подарунок Neuronox', division: 'Киев', sumUsd: 0 });
  assert.equal(c.isGift, true);
  assert.equal(c.giftBrand, 'Neuronox');
});

test('classifySale — подарунок з ненульовою сумою НЕ gift', () => {
  const c = classifySale({ product: 'Vitaran i', discount: 'Подарок Vitaran', division: 'Киев', sumUsd: 100 });
  assert.equal(c.isGift, false);
});

test('classifySale — амбассадор безкоштовно = excluded; платно = ні', () => {
  assert.equal(classifySale({ product: 'Ellanse S', discount: 'Амбассадор', division: 'Киев', sumUsd: 0 }).isExcluded, true);
  assert.equal(classifySale({ product: 'Ellanse S', discount: 'Амбассадор', division: 'Киев', sumUsd: 200 }).isExcluded, false);
});

test('classifySale — розхідник без бренду → ignored + UNMAPPED', () => {
  const c = classifySale({ product: 'Канюля 25G', discount: null, division: 'Одесса', sumUsd: 5 });
  assert.equal(c.brand, UNMAPPED_BRAND);
  assert.equal(c.isIgnored, true);
});

test('classifySale — колл-центр канал', () => {
  const c = classifySale({ product: 'ESSE Serum', discount: null, division: 'Коллцентр Call center лидогенерация', sumUsd: 40 });
  assert.equal(c.channel, 'call_center');
  assert.equal(c.brand, 'ESSE');
});
