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
  detectPromoTriggerBrand,
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

test('detectBrand — Vitaran Cosmetics (Exosome/Centella), НЕ ignored і НЕ Vitaran', () => {
  // Група «01. VITARAN Cosmetics» у 1С = бренд «Vitaran Cosmetics», сегмент «Інші ТМ».
  assert.equal(detectBrand('Exosome-PDRN Azulene Serum, 50ml'), 'Vitaran Cosmetics');
  assert.equal(detectBrand('Exosome-PDRN NMN Cream, 50ml'), 'Vitaran Cosmetics');
  assert.equal(detectBrand('PURE CENTELLA MADE CREAM / 30 g'), 'Vitaran Cosmetics');
  // Ін'єкційний Vitaran лишається окремо.
  assert.equal(detectBrand('HP CELL VITARAN i'), 'Vitaran');
  // Більше не ігноруються (це реальні товари, не консумативи).
  assert.equal(isIgnoredProduct('Exosome-PDRN Azulene Serum'), false);
  assert.equal(isIgnoredProduct('PURE CENTELLA MADE CREAM'), false);
});

test('detectBrand — невідомий товар → null', () => {
  assert.equal(detectBrand('Канюля 25G 50mm'), null);
  assert.equal(detectBrand('Якийсь невідомий товар'), null);
});

// === detectChannel (4-way: representatives / call_center / distributors / other) ===
test('detectChannel — 4 канали за підрозділом', () => {
  // колл-центр (+ інтернет-магазин = той самий B2C-канал)
  assert.equal(detectChannel('Коллцентр Call center лидогенерация'), 'call_center');
  assert.equal(detectChannel('call-center'), 'call_center');
  assert.equal(detectChannel('Интернет магазин esseskincare'), 'call_center');
  // представництва (Херсон — офіс закрито, історичні продажі рахуємо)
  assert.equal(detectChannel('Киев'), 'representatives');
  assert.equal(detectChannel('Одесса'), 'representatives');
  assert.equal(detectChannel('Житомир'), 'representatives');
  assert.equal(detectChannel('Херсон'), 'representatives');
  // seller-фолбек: історичний TSV-імпорт клав повод у division, місто — у seller
  assert.equal(detectChannel('Акция периода', 'Киев'), 'representatives');
  assert.equal(detectChannel('Ценообразование', 'Коллцентр Call center'), 'call_center');
  assert.equal(detectChannel('СРОК', 'Іванова О.'), 'other'); // seller=менеджер → лишається other
  // дистриб'ютори (суфікс '*' нормалізується)
  assert.equal(detectChannel('Полтава*'), 'distributors');
  assert.equal(detectChannel('Черновцы*'), 'distributors');
  // «окремі» / службові → other (поза периметром стратегії)
  assert.equal(detectChannel('Лазерхауз*'), 'other');
  assert.equal(detectChannel('Адасса'), 'other');
  assert.equal(detectChannel('Сотрудники,  модели, проч'), 'other');
  assert.equal(detectChannel(''), 'other');
  assert.equal(detectChannel(null), 'other');
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
    promoTriggerBrand: null,
  });
});

test('detectPromoTriggerBrand — бренд-тригер до слова «Подарок»', () => {
  assert.equal(detectPromoTriggerBrand('VITARAN а ассор.на 700дол+Подарок 1уп Marine Collagen'), 'Vitaran');
  assert.equal(detectPromoTriggerBrand('Petaran 2шт+Подарунок VITARAN Tox'), 'Petaran');
  assert.equal(detectPromoTriggerBrand('ESSE 5000грн+Tube K5, M5'), 'ESSE'); // без подарунка → весь текст
  assert.equal(detectPromoTriggerBrand('звичайна знижка -10%'), null);
  assert.equal(detectPromoTriggerBrand(null), null);
});

test('classifySale — тригер лише на gift-рядку', () => {
  const gift = classifySale({ product: 'IUSE Marine Collagen', discount: 'VITARAN а ассор.на 700дол+Подарок Marine Collagen', division: 'Киев', sumUsd: 0 });
  assert.equal(gift.isGift, true);
  assert.equal(gift.promoTriggerBrand, 'Vitaran');
  const disc = classifySale({ product: 'HP CELL VITARAN i II', discount: 'Vitaran від 4х уп. -15%', division: 'Киев', sumUsd: 720 });
  assert.equal(disc.promoTriggerBrand, null); // не gift → тригер не проставляємо
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

test('classifySale — $0 саше/шот = роздача (excluded), платне = продаж', () => {
  const sachet = classifySale({ product: 'M5.ESSE Light Moisturiser 1мл sachet', discount: null, division: 'Киев', sumUsd: 0 });
  assert.equal(sachet.isExcluded, true);
  assert.equal(sachet.brand, 'ESSE'); // бренд лишається, але excluded
  const shot = classifySale({ product: 'IUSE Marine Collagen - 1 шот', discount: '1 $ + 1 шот IUSE Collagen', division: 'Коллцентр', sumUsd: 0 });
  assert.equal(shot.isExcluded, true); // $0 шот = роздача
  const paidSachet = classifySale({ product: 'ESSE Serum саше 2ml', discount: null, division: 'Киев', sumUsd: 3 });
  assert.equal(paidSachet.isExcluded, false); // платне міні = продаж
  const pkg = classifySale({ product: 'IUSE Marine Collagen - Морський колаген, упаковка 30 шотів', discount: null, division: 'Коллцентр', sumUsd: 76 });
  assert.equal(pkg.isExcluded, false); // упаковка (платна) = продаж
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
