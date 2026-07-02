"""
Розбір червневого файлу продажів для наповнення Strategic KPI dashboard.

Використовує:
  - Джерело: G:\\Мой диск\\Аналитика\\product-analytics\\data\\Июнь База.txt
  - Правила брендів: BRAND_RULES (регекси з sales-planning methodology + перевірене
    поведінка з product-analytics brand_analytics_2026.py BRAND_MAP)
  - Класифікацію каналів: division = 'Коллцентр...' → Колл-центр, інше → Представництва

Output: reports/analytics-june-2026.json — метрики для wireframe
"""
import re
import json
import io
import sys
import csv
from pathlib import Path
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

INPUT = Path(r'G:\Мой диск\Аналитика\product-analytics\data\Июнь База.txt')
OUT_DIR = Path(__file__).parent.parent / 'reports'
OUT_DIR.mkdir(exist_ok=True)
OUT = OUT_DIR / 'analytics-june-2026.json'

# ============================================================================
# Правила визначення бренду з тексту номенклатури.
# Порядок ВАЖЛИВИЙ — перше співпадіння виграє. Специфічні правила ставимо
# вгору, узагальнюючі — вниз (Другие ТМ ловить залишок).
# ============================================================================
BRAND_RULES = [
    ('Vitaran',      re.compile(r'HP\s*CELL\s*VITARAN', re.I)),
    ('Neuronox',     re.compile(r'Neuronox', re.I)),
    ('ELLANSE',      re.compile(r'ELLANSE', re.I)),
    ('Petaran',      re.compile(r'PETARAN', re.I)),
    ('Neuramis',     re.compile(r'NEURAMIS', re.I)),
    ('EXOXE',        re.compile(r'EXOXE', re.I)),
    ('IUSE',         re.compile(r'IUSE', re.I)),  # Collagen/SkinBooster/волосы — всі під IUSE
    ('ESSE',         re.compile(r'\bESSE\b|C5\.ESSE|ESSE\s*(Gel|Cream|Serum|Emulsion|Тонік|Cleanser|Skin)', re.I)),
]

def detect_brand(product_name: str) -> str:
    for brand, pat in BRAND_RULES:
        if pat.search(product_name):
            return brand
    return 'Другие ТМ'


def detect_channel(division: str) -> str:
    """Представництва (регіони) vs Колл-центр."""
    d = (division or '').strip().lower()
    if 'коллцентр' in d or 'call center' in d or 'call-center' in d:
        return 'Колл-центр'
    return 'Представництва'


def parse_num(s: str) -> float:
    """1С формат: '3,000' = 3.0 (десяткова кома), '1\\xa0185,52' = 1185.52 (NBSP роздільник тисяч)."""
    if not s or s.strip() == '':
        return 0.0
    # Спочатку прибираємо всі види пробілів (включно з NBSP \xa0)
    cleaned = s.replace('\xa0', '').replace(' ', '').replace(' ', '')
    # 1С: остання кома — десятковий роздільник. Тому: якщо в числі є кома —
    # заміняємо кому на крапку, крапки (тисячі) прибираємо. Якщо коми немає —
    # значить крапка вже десятковий роздільник, нічого не робимо.
    if ',' in cleaned:
        # '1.185,52' → '1185.52'; '3,000' → '3.000' → 3.0
        cleaned = cleaned.replace('.', '').replace(',', '.')
    return float(cleaned)


def main():
    if not INPUT.exists():
        print(f'ERROR: {INPUT} not found', file=sys.stderr)
        sys.exit(1)

    print(f'Reading {INPUT} ({INPUT.stat().st_size // 1024} KB)')

    # 1С TSV: спочатку 20 рядків метаданих, потім заголовок, потім дані
    with open(INPUT, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()

    # Знаходимо шапку — рядок з "Документ продажи" + "Дата" + "Контрагент"
    header_idx = None
    for i, line in enumerate(lines):
        if 'Документ продажи' in line and 'Дата' in line and 'Контрагент' in line:
            header_idx = i
            break
    if header_idx is None:
        print('ERROR: header row not found', file=sys.stderr)
        sys.exit(1)

    header = [c.strip() for c in lines[header_idx].rstrip('\n').split('\t')]
    print(f'Header on line {header_idx + 1}: {len(header)} cols → {header}')

    # Індекси колонок (перша колонка порожня — префікс, пропускаємо)
    def col_idx(name):
        for i, h in enumerate(header):
            if h.strip() == name:
                return i
        return None

    IDX_DATE = col_idx('Дата')
    IDX_CLIENT_NAME = col_idx('Контрагент')
    IDX_CLIENT_CODE = col_idx('Код')
    IDX_PHONE = col_idx('Телефон контрагента')
    IDX_PRODUCT = col_idx('Номенклатура')
    IDX_DISCOUNT = col_idx('Повод скидки')
    IDX_DIVISION = col_idx('Подразделение')
    IDX_SELLER = col_idx('Сотрудник')
    IDX_SEMINAR = col_idx('Семинар')
    IDX_PROJECT = col_idx('Проект')
    IDX_QTY = col_idx('Количество (в ед. хранения)')
    IDX_SUM = col_idx('Сумма продажи (без НДС) в USD')

    print(f'Column indices: date={IDX_DATE} name={IDX_CLIENT_NAME} code={IDX_CLIENT_CODE} '
          f'product={IDX_PRODUCT} discount={IDX_DISCOUNT} div={IDX_DIVISION} '
          f'qty={IDX_QTY} sum={IDX_SUM}')

    # Ітерація по даних
    rows = []
    skipped = 0
    for i, line in enumerate(lines[header_idx + 1:], start=header_idx + 2):
        parts = line.rstrip('\n').split('\t')
        if len(parts) < IDX_SUM + 1:
            skipped += 1
            continue

        client_code = parts[IDX_CLIENT_CODE].strip() if IDX_CLIENT_CODE is not None else ''
        product = parts[IDX_PRODUCT].strip() if IDX_PRODUCT is not None else ''
        division = parts[IDX_DIVISION].strip() if IDX_DIVISION is not None else ''

        # Skip підсумкові / пусті
        if not client_code or not product:
            skipped += 1
            continue
        if 'итог' in (parts[0].lower() if len(parts) > 0 else ''):
            skipped += 1
            continue

        qty = parse_num(parts[IDX_QTY]) if IDX_QTY is not None else 0
        sum_usd = parse_num(parts[IDX_SUM]) if IDX_SUM is not None else 0

        rows.append({
            'client_code': client_code,
            'client_name': parts[IDX_CLIENT_NAME].strip() if IDX_CLIENT_NAME is not None else '',
            'product': product,
            'discount': parts[IDX_DISCOUNT].strip() if IDX_DISCOUNT is not None else '',
            'division': division,
            'qty': qty,
            'sum_usd': sum_usd,
            'brand': detect_brand(product),
            'channel': detect_channel(division),
        })

    print(f'Parsed {len(rows)} rows (skipped {skipped})')

    # ============================================================================
    # Агрегація по бренд × канал
    # ============================================================================
    # Метрики (за один місяць — червень 2026):
    # - unique_clients: distinct client_code
    # - buyers_month: те саме що unique_clients (за поточний місяць — все розбитно)
    # - total_qty: сума qty
    # - total_sum: сума USD
    # - avg_qty_per_client: total_qty / unique_clients
    # - avg_check: total_sum / unique_clients (за місяць — це і є середній чек за місяць)
    # ============================================================================

    ALL_BRANDS = ['Vitaran', 'Neuronox', 'ELLANSE', 'Petaran', 'Neuramis',
                  'EXOXE', 'IUSE', 'ESSE', 'Другие ТМ']
    CHANNELS = ['Представництва', 'Колл-центр']

    result = {
        'period': 'June 2026',
        'source': str(INPUT),
        'total_rows': len(rows),
        'brands': {},
        'overall': {},
        'divisions_seen': sorted(set(r['division'] for r in rows if r['division'])),
    }

    def aggregate(subset):
        clients = set(r['client_code'] for r in subset)
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

    # По бренд × канал
    for brand in ALL_BRANDS:
        result['brands'][brand] = {'channels': {}, 'total': {}}
        brand_rows = [r for r in rows if r['brand'] == brand]
        result['brands'][brand]['total'] = aggregate(brand_rows)

        for channel in CHANNELS:
            subset = [r for r in brand_rows if r['channel'] == channel]
            result['brands'][brand]['channels'][channel] = aggregate(subset)

        # Топ 5 промо-акцій цього бренду
        promo_stats = defaultdict(lambda: {'unique_clients': set(), 'qty': 0})
        for r in brand_rows:
            if r['discount']:
                promo_stats[r['discount']]['unique_clients'].add(r['client_code'])
                promo_stats[r['discount']]['qty'] += r['qty']
        promos = []
        for name, s in promo_stats.items():
            promos.append({
                'name': name,
                'clients': len(s['unique_clients']),
                'qty': round(s['qty'], 2),
            })
        promos.sort(key=lambda x: x['clients'], reverse=True)
        result['brands'][brand]['promos'] = promos[:5]

    result['overall']['total'] = aggregate(rows)
    for channel in CHANNELS:
        result['overall'][channel] = aggregate([r for r in rows if r['channel'] == channel])

    # ============================================================================
    # Sanity: чи були рядки з невідомим брендом?
    # ============================================================================
    unknown_products = defaultdict(int)
    for r in rows:
        if r['brand'] == 'Другие ТМ':
            unknown_products[r['product']] += 1
    top_unknown = sorted(unknown_products.items(), key=lambda x: -x[1])[:15]
    result['unknown_products_top'] = [{'product': p, 'rows': n} for p, n in top_unknown]

    # ============================================================================
    # Write
    # ============================================================================
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f'\nWrote {OUT}')

    # ============================================================================
    # Console summary
    # ============================================================================
    print(f'\n{"=" * 80}\nSUMMARY · Червень 2026\n{"=" * 80}')
    print(f'Всього рядків: {result["total_rows"]:,}')
    print(f'Всього унік. клієнтів: {result["overall"]["total"]["unique_clients"]:,}')
    print(f'Всього USD: ${result["overall"]["total"]["total_sum_usd"]:,.0f}')
    print(f'\nПідрозділи ({len(result["divisions_seen"])}): {result["divisions_seen"]}')

    print(f'\n{"Бренд":<15} {"Канал":<20} {"Клієнти":>10} {"Кол-во":>10} {"$ USD":>12} {"Чек":>10} {"ср/уп":>7}')
    print('-' * 90)
    for brand in ALL_BRANDS:
        for channel in CHANNELS:
            m = result['brands'][brand]['channels'][channel]
            if m['unique_clients'] == 0:
                continue
            print(f'{brand:<15} {channel:<20} {m["unique_clients"]:>10} {m["total_qty"]:>10.0f} '
                  f'{m["total_sum_usd"]:>12,.0f} {m["avg_check_usd"]:>10,.0f} {m["avg_qty_per_client"]:>7.1f}')

    if result['unknown_products_top']:
        print(f'\nТоп невідомих продуктів (мапнулись у "Другие ТМ"):')
        for u in result['unknown_products_top'][:10]:
            print(f'  {u["rows"]:>4}x  {u["product"][:80]}')


if __name__ == '__main__':
    main()
