"""
Фінальний аналіз червня 2026 з узгодженими правилами:

БРЕНДИ (11): Neuronox, Petaran, Ellanse, Vitaran, EXOXE, Neuramis, ESSE,
              IUSE SB, IUSE hair, IUSE Coll., БАД

ВИКЛЮЧАЄМО (рядки не рахуємо взагалі):
  - Косметика EXOXE (Exosome-PDRN, PURE CENTELLA)
  - Розхідники (холодоагент, канюлі, голки, шприци, картриджі, насадки)
  - ESSE сумки/мішечки (Beach Bag, Пляжна сумка)
  - ESSE саше
  - Повід скидки: Рекламная продукция / День Рождения / Гонорар
  - Ambассадор з sum_usd = 0 (безкоштовні відвантаження)
  - Рядки з "Подарок" у поводі і sum_usd = 0 (сам подарунковий товар)

ПРОМО-АКЦІЇ:
  - Якщо у поводі знайдено "Подарок X" — акція показується у блоці бренду
    подарунка (X), а не бренду тригера покупки.

Виведення:
  - reports/analytics-june-final.json — метрики для wireframe
  - Console: summary по 11 брендах × 2 канали
"""
import re
import sys
import io
import json
from pathlib import Path
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

INPUT = Path(r'G:\Мой диск\Аналитика\product-analytics\data\Продажи Июнь.txt')
OUT = Path(__file__).parent.parent / 'reports' / 'analytics-june-final.json'
OUT.parent.mkdir(exist_ok=True)

# ============================================================================
# 11 брендів
# ============================================================================
BRAND_RULES = [
    ('Neuronox',   re.compile(r'Neuronox|Ботулотоксин', re.I)),
    ('Petaran',    re.compile(r'PETARAN', re.I)),
    ('Ellanse',    re.compile(r'ELLANSE', re.I)),
    ('Vitaran',    re.compile(r'HP\s*CELL\s*VITARAN|VITARAN\s*(?:i\b|Tox|Whitening|Cosm|а\s*ассор)', re.I)),
    ('EXOXE',      re.compile(r'\bEXOXE\b(?!\-)', re.I)),  # EXOXE Cosmetic ok, але не Exosome
    ('Neuramis',   re.compile(r'NEURAMIS', re.I)),
    ('IUSE SB',    re.compile(r'IUSE.*Skin\s*Booster|Skin\s*Booster', re.I)),
    ('IUSE hair',  re.compile(r'IUSE.*(?:hair|волос)|IUSE\s+H\b', re.I)),
    ('IUSE Coll.', re.compile(r'IUSE.*Collagen|Marine\s*Collagen', re.I)),
    ('ESSE',       re.compile(r'\.?ESSE\b|C5\.ESSE|SkinTrial|Skin\s*Trial|Gift\s*set\s*2026|ESSE\s*(?:Gel|Cream|Serum|Emulsion|Tonic|Cleanser|Skin|Dry|Set|Bakuchiol|Biome|Concealer|tube|Sensitive)', re.I)),
    ('БАД',        re.compile(r'MAGNOX|Дієтична\s*добавк|Диетическая\s*добавк|БАД', re.I)),
]


def detect_brand(product_name: str) -> str | None:
    for brand, pat in BRAND_RULES:
        if pat.search(product_name):
            return brand
    return None


# ============================================================================
# Товари яких повністю ІГНОРУЄМО (не входять у жоден бренд)
# ============================================================================
IGNORE_PRODUCT_PATTERNS = [
    re.compile(r'Exosome-PDRN', re.I),          # косметика EXOXE (не рахується)
    re.compile(r'PURE\s*CENTELLA', re.I),        # косметика
    re.compile(r'Холодоагент', re.I),            # розхідник
    re.compile(r'Канюл', re.I),                  # розхідник
    re.compile(r'\bГолк\b|Screw\s*Needles', re.I),  # розхідник
    re.compile(r'Шприц', re.I),                  # розхідник
    re.compile(r'Картридж', re.I),               # розхідник
    re.compile(r'Насадк', re.I),                 # розхідник
    re.compile(r'Beach\s*Bag|Пляжна\s*сумка|Мішечок|Сумка\s*(?:C1|Esse)', re.I),  # ESSE сумки/мішечки
    re.compile(r'\bсаше\b|sachet', re.I),        # ESSE саше
    re.compile(r'\bTESTER\b|ТЕСТЕР|тестер', re.I),  # ESSE тестери
]


def is_ignored_product(product: str) -> bool:
    for pat in IGNORE_PRODUCT_PATTERNS:
        if pat.search(product):
            return True
    return False


# ============================================================================
# Поводи скидки — виключити рядок з унік. клієнтів
# ============================================================================
EXCLUDE_DISCOUNT_PATTERNS = [
    re.compile(r'Рекламная\s*продукция', re.I),
    re.compile(r'День\s*Рождения|ДР\b', re.I),
    re.compile(r'Гонорар', re.I),
]


def is_excluded_discount(discount: str) -> bool:
    if not discount:
        return False
    for pat in EXCLUDE_DISCOUNT_PATTERNS:
        if pat.search(discount):
            return True
    return False


def is_ambassador(discount: str) -> bool:
    return bool(discount and re.search(r'Амбассадор', discount, re.I))


def is_gift_in_discount(discount: str) -> bool:
    """Повод містить слово Подарок/Подарунок."""
    return bool(discount and re.search(r'Подар(ок|унок)', discount, re.I))


def detect_gift_brand(discount: str) -> str | None:
    """Якщо у поводі "Подарок X" знайти бренд подарунка X (для info)."""
    if not is_gift_in_discount(discount):
        return None
    m = re.search(r'Подар(?:ок|унок)\s+([^(]+?)(?:\s*\(|$)', discount, re.I)
    if not m:
        return None
    return detect_brand(m.group(1))


def detect_promo_trigger_brand(discount: str) -> str | None:
    """Визначити бренд-тригер з тексту поводу.

    Приклад:
      "VITARAN на 700дол+Подарок 1уп Marine Collagen" → Vitaran
      "Petaran від 2х -3,57% по 135$" → Petaran
      "MAGNOX від 2х уп. - 20%" → БАД
    Беремо ПЕРШИЙ бренд який matches у тексті поводу (той що просуваємо).
    """
    if not discount:
        return None
    # Беремо частину до "Подарок" — там йде опис що ПРОДАЄМО.
    trigger_part = re.split(r'Подар(?:ок|унок)', discount, maxsplit=1, flags=re.I)[0]
    return detect_brand(trigger_part)


def parse_num(s):
    if not s or s.strip() == '':
        return 0.0
    cleaned = s.replace('\xa0', '').replace(' ', '').replace(' ', '')
    if ',' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    return float(cleaned)


def detect_channel(division: str) -> str:
    d = (division or '').strip().lower()
    if 'коллцентр' in d or 'call center' in d or 'call-center' in d:
        return 'Колл-центр'
    return 'Представництва'


# ============================================================================
def main():
    with open(INPUT, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()

    header_idx = None
    for i, line in enumerate(lines):
        if 'Документ продажи' in line and 'Дата' in line:
            header_idx = i
            break
    header = [c.strip() for c in lines[header_idx].rstrip('\n').split('\t')]

    IDX_CODE = header.index('Код')
    IDX_NAME = header.index('Контрагент')
    IDX_PRODUCT = header.index('Номенклатура')
    IDX_DISCOUNT = header.index('Повод скидки')
    IDX_DIVISION = header.index('Подразделение')
    IDX_QTY = header.index('Количество (в ед. хранения)')
    IDX_SUM = header.index('Сумма продажи (без НДС) в USD')

    raw_rows = []
    for line in lines[header_idx + 1:]:
        parts = line.rstrip('\n').split('\t')
        if len(parts) < IDX_SUM + 1:
            continue
        code = parts[IDX_CODE].strip()
        product = parts[IDX_PRODUCT].strip()
        if not code or not product:
            continue
        raw_rows.append({
            'code': code,
            'name': parts[IDX_NAME].strip(),
            'product': product,
            'discount': parts[IDX_DISCOUNT].strip(),
            'division': parts[IDX_DIVISION].strip(),
            'qty': parse_num(parts[IDX_QTY]),
            'sum_usd': parse_num(parts[IDX_SUM]),
        })

    stats = {
        'raw_rows': len(raw_rows),
        'skipped_ignored_product': 0,
        'skipped_excluded_discount': 0,
        'skipped_ambassador_free': 0,
        'skipped_gift_row': 0,
        'accepted': 0,
    }

    # Валідні рядки — які реально враховуються у метрики
    valid = []
    for r in raw_rows:
        # ПОРЯДОК: спочатку detect_brand — якщо це відомий бренд, ignore-список
        # НЕ застосовується. Бо у «ELLANSE S (2 шприци*1 мл)» слово «шприци» це
        # кількість флаконів у комплекті, не розхідник.
        brand = detect_brand(r['product'])

        if brand is None and is_ignored_product(r['product']):
            stats['skipped_ignored_product'] += 1
            continue

        if is_excluded_discount(r['discount']):
            stats['skipped_excluded_discount'] += 1
            continue
        if is_ambassador(r['discount']) and r['sum_usd'] == 0:
            stats['skipped_ambassador_free'] += 1
            continue
        # Рядок з подарунковим товаром — якщо sum_usd == 0 і у поводі є "Подарок",
        # це і є той рядок з подарунком; клієнта по ньому не рахуємо
        if is_gift_in_discount(r['discount']) and r['sum_usd'] == 0:
            stats['skipped_gift_row'] += 1
            continue

        r['brand'] = brand if brand else 'НЕ_МАПНУТО'
        r['channel'] = detect_channel(r['division'])
        valid.append(r)
        stats['accepted'] += 1

    # ============================================================================
    # Агрегація метрик
    # ============================================================================
    BRANDS = ['Neuronox', 'Petaran', 'Ellanse', 'Vitaran', 'EXOXE', 'Neuramis',
              'IUSE SB', 'IUSE hair', 'IUSE Coll.', 'ESSE', 'БАД']
    CHANNELS = ['Представництва', 'Колл-центр']

    def aggregate(subset):
        clients = set(r['code'] for r in subset)
        qty = sum(r['qty'] for r in subset)
        s = sum(r['sum_usd'] for r in subset)
        n = len(clients)
        return {
            'unique_clients': n,
            'total_qty': round(qty, 2),
            'total_sum_usd': round(s, 2),
            'avg_qty_per_client': round(qty / n, 2) if n else 0,
            'avg_check_usd': round(s / n, 2) if n else 0,
            'rows': len(subset),
        }

    result = {
        'period': 'June 2026',
        'source': str(INPUT),
        'stats': stats,
        'brands': {},
        'overall': {},
        'divisions_seen': sorted(set(r['division'] for r in valid if r['division'])),
    }

    # ============================================================================
    # Промо: будуємо з RAW rows (включно з gift-рядками!) — інакше акції типу
    # «Vitaran 700$ + Подарок Marine Collagen» зникають бо всі 179 їхніх рядків
    # це gift-рядки Marine Collagen з sum=0.
    #
    # display_brand = trigger_brand (той що промотуємо через акцію).
    # ============================================================================
    promos = defaultdict(lambda: {
        'display_brand': None,
        'trigger_brand': None,
        'gift_brand': None,
        'unique_clients': set(),
        'qty': 0.0,
        'sum_usd': 0.0,
    })

    for r in raw_rows:
        d = r['discount']
        if not d:
            continue
        # Виключаємо не-акції (реклама, ДР, гонорар) — це не промо
        if is_excluded_discount(d):
            continue
        # Ambassador free — не промо (це безкоштовне відвантаження)
        if is_ambassador(d) and r['sum_usd'] == 0:
            continue

        trigger_brand = detect_promo_trigger_brand(d)
        gift_brand = detect_gift_brand(d)

        # Fallback: якщо у тексті поводу бренд не визначено — беремо з бренду товару
        if not trigger_brand:
            trigger_brand = detect_brand(r['product'])

        if not trigger_brand:
            continue  # промо без визначеного бренду — пропускаємо

        promos[d]['display_brand'] = trigger_brand
        promos[d]['trigger_brand'] = trigger_brand
        promos[d]['gift_brand'] = gift_brand
        promos[d]['unique_clients'].add(r['code'])
        promos[d]['qty'] += r['qty']
        promos[d]['sum_usd'] += r['sum_usd']

    # По бренд × канал
    for brand in BRANDS:
        result['brands'][brand] = {'channels': {}, 'total': {}, 'promos': []}
        brand_rows = [r for r in valid if r['brand'] == brand]
        result['brands'][brand]['total'] = aggregate(brand_rows)
        for channel in CHANNELS:
            subset = [r for r in brand_rows if r['channel'] == channel]
            result['brands'][brand]['channels'][channel] = aggregate(subset)

        # Топ-5 промо цього бренду (за унік. клієнтами)
        brand_promos = []
        for name, p in promos.items():
            if p['display_brand'] == brand:
                brand_promos.append({
                    'name': name,
                    'clients': len(p['unique_clients']),
                    'qty': round(p['qty'], 2),
                    'sum_usd': round(p['sum_usd'], 2),
                    'is_gift': p['gift_brand'] is not None,
                    'trigger_brand': p['trigger_brand'],
                })
        brand_promos.sort(key=lambda x: -x['clients'])
        result['brands'][brand]['promos'] = brand_promos[:5]

    # Загальний огляд
    result['overall']['total'] = aggregate(valid)
    for channel in CHANNELS:
        result['overall'][channel] = aggregate([r for r in valid if r['channel'] == channel])

    # Незамаповані — контроль
    unmapped_products = defaultdict(int)
    for r in valid:
        if r['brand'] == 'НЕ_МАПНУТО':
            unmapped_products[r['product']] += 1
    result['unmapped_products'] = [{'product': p, 'rows': n}
                                     for p, n in sorted(unmapped_products.items(), key=lambda x: -x[1])][:20]

    # ============================================================================
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # ============================================================================
    print(f'\n{"=" * 80}')
    print('ЧЕРВЕНЬ 2026 · ФІНАЛЬНИЙ АНАЛІЗ')
    print(f'{"=" * 80}')
    print(f'\nRAW: {stats["raw_rows"]:,} рядків')
    print(f'  - Ignored (косметика, розхідники, сумки, саше): {stats["skipped_ignored_product"]}')
    print(f'  - Excluded discount (реклама/ДР/гонорар):        {stats["skipped_excluded_discount"]}')
    print(f'  - Амбассадор free (sum=0):                       {stats["skipped_ambassador_free"]}')
    print(f'  - Gift row (sum=0 з подарунком):                 {stats["skipped_gift_row"]}')
    print(f'  = ACCEPTED:                                      {stats["accepted"]:,}')

    print(f'\nВсього унік. клієнтів (по коду): {result["overall"]["total"]["unique_clients"]:,}')
    print(f'Всього USD (accepted):           ${result["overall"]["total"]["total_sum_usd"]:,.0f}')

    print(f'\n{"Бренд":<12} {"Канал":<18} {"Клієнти":>8} {"Кол-во":>8} {"$ USD":>11} {"Чек":>8} {"ср/уп":>7}')
    print('-' * 78)
    for brand in BRANDS:
        for channel in CHANNELS:
            m = result['brands'][brand]['channels'][channel]
            if m['unique_clients'] == 0:
                continue
            print(f'{brand:<12} {channel:<18} {m["unique_clients"]:>8} {m["total_qty"]:>8.0f} '
                  f'{m["total_sum_usd"]:>11,.0f} {m["avg_check_usd"]:>8,.0f} {m["avg_qty_per_client"]:>7.1f}')

    print(f'\nПРОМО ПО БРЕНДАХ (топ 5 по клієнтах, включно з gift-переносами):')
    for brand in BRANDS:
        promos_list = result['brands'][brand]['promos']
        if not promos_list:
            continue
        print(f'\n--- {brand} ---')
        for p in promos_list:
            gift_tag = ' [GIFT]' if p['is_gift'] else ''
            trigger = f' (тригер: {p["trigger_brand"]})' if p['is_gift'] else ''
            print(f'  {p["clients"]:>4} кл. · {p["qty"]:>5.0f} шт · ${p["sum_usd"]:>8,.0f}  {p["name"][:60]}{gift_tag}{trigger}')

    if result['unmapped_products']:
        print(f'\n⚠️ Все ще незамаповано {len(result["unmapped_products"])} товарів:')
        for u in result['unmapped_products'][:15]:
            print(f'  {u["rows"]:>3}x  {u["product"][:75]}')

    print(f'\nJSON: {OUT}')


if __name__ == '__main__':
    main()
