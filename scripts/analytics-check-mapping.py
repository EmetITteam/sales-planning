"""
Разберемось з:
1. Списком брендів (11 разом з розшивкою IUSE, БАД, Токсин=Neuronox)
2. Товарами що не мапляться — щоб узгодити з користувачем
3. Знайти всі "Повод скидки" щоб визначити подарункові акції
"""
import re
import sys
import io
from pathlib import Path
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

INPUT = Path(r'G:\Мой диск\Аналитика\product-analytics\data\Июнь База.txt')

# ============================================================================
# 11 брендів для аналітики (розшивка IUSE + БАД + Toxin/Neuronox)
# ============================================================================
BRAND_RULES = [
    # Специфічні — вгору
    ('Neuronox',      re.compile(r'Neuronox|Ботулотоксин', re.I)),
    ('Petaran',       re.compile(r'PETARAN', re.I)),
    ('Ellanse',       re.compile(r'ELLANSE', re.I)),
    ('Vitaran',       re.compile(r'HP\s*CELL\s*VITARAN|VITARAN', re.I)),
    ('EXOXE',         re.compile(r'EXOXE', re.I)),
    ('Neuramis',      re.compile(r'NEURAMIS', re.I)),
    # ESSE — до IUSE (у IUSE є рядок з ESSE)
    ('ESSE',          re.compile(r'\.ESSE|ESSE\s*(?:Gel|Cream|Serum|Emulsion|Tonic|Cleanser|Skin|Dry|Set)', re.I)),
    # IUSE розшивка
    ('IUSE SB',       re.compile(r'IUSE.*SkinBooster|IUSE.*Skin\s*Booster|SkinBooster', re.I)),
    ('IUSE hair',     re.compile(r'IUSE.*(?:hair|волос)|IUSE\s+H\b', re.I)),
    ('IUSE Coll.',    re.compile(r'IUSE.*Collagen|Marine\s*Collagen', re.I)),
    # БАД — MAGNOX, будь-які добавки, шоти
    ('БАД',           re.compile(r'MAGNOX|БАД|Дієтична добавк|Диетическая добавк', re.I)),
]

# «Подарункові» скидки — виключаємо цих клієнтів з підрахунку унік. клієнтів
# (бо продали за 0 або як бонус, це не реальна покупка)
GIFT_DISCOUNT_PATTERNS = [
    re.compile(r'подарок|подарунок', re.I),
    # У 1С формат: "…СПЕЦ" зазвичай означає бонусний товар з пакету
    # Але не завжди — треба ще уточнити.
]


def detect_brand(product_name: str) -> str:
    for brand, pat in BRAND_RULES:
        if pat.search(product_name):
            return brand
    return 'НЕ_МАПНУТО'


def parse_num(s):
    if not s or s.strip() == '':
        return 0.0
    cleaned = s.replace('\xa0', '').replace(' ', '').replace(' ', '')
    if ',' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    return float(cleaned)


def is_gift(discount: str) -> bool:
    if not discount:
        return False
    for pat in GIFT_DISCOUNT_PATTERNS:
        if pat.search(discount):
            return True
    return False


def main():
    with open(INPUT, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()

    header_idx = None
    for i, line in enumerate(lines):
        if 'Документ продажи' in line and 'Дата' in line:
            header_idx = i
            break

    header = [c.strip() for c in lines[header_idx].rstrip('\n').split('\t')]
    IDX_PRODUCT = header.index('Номенклатура')
    IDX_DISCOUNT = header.index('Повод скидки')
    IDX_DIVISION = header.index('Подразделение')
    IDX_CODE = header.index('Код')

    rows = []
    for line in lines[header_idx + 1:]:
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 14:
            continue
        product = parts[IDX_PRODUCT].strip()
        if not product:
            continue
        rows.append({
            'code': parts[IDX_CODE].strip(),
            'product': product,
            'discount': parts[IDX_DISCOUNT].strip(),
            'division': parts[IDX_DIVISION].strip(),
        })

    print(f'Всього рядків: {len(rows)}')

    # ============================================================================
    # 1. Товари що НЕ МАПНУЛИСЬ — треба уточнити куди їх віднести
    # ============================================================================
    print('\n' + '=' * 80)
    print('НЕ МАПНУТО У БРЕНД (треба узгодити куди відносити):')
    print('=' * 80)

    unmapped = defaultdict(int)
    for r in rows:
        b = detect_brand(r['product'])
        if b == 'НЕ_МАПНУТО':
            unmapped[r['product']] += 1

    total_unmapped_rows = sum(unmapped.values())
    print(f'Всього {len(unmapped)} унікальних товарів, {total_unmapped_rows} рядків\n')
    for product, cnt in sorted(unmapped.items(), key=lambda x: -x[1])[:30]:
        # моя пропозиція куди віднести
        proposal = 'Другие ТМ?'
        p_lower = product.lower()
        if 'exosome' in p_lower or 'pdrn' in p_lower:
            proposal = '→ EXOXE?'
        elif 'холодоагент' in p_lower:
            proposal = '→ витратний матеріал (не рахувати)'
        elif 'канюл' in p_lower or 'голк' in p_lower:
            proposal = '→ витратний матеріал (не рахувати)'
        elif 'centella' in p_lower or 'centella' in p_lower or 'скіркер' in p_lower:
            proposal = '→ Другие ТМ?'
        elif 'set' in p_lower or 'travel' in p_lower:
            proposal = '→ ESSE (Set)?'
        elif 'magnox' in p_lower or 'дієтичн' in p_lower:
            proposal = '→ БАД (має мапнутись, перевірити regex)'

        print(f'  {cnt:>4}x  {product[:80]:<82}  {proposal}')

    # ============================================================================
    # 2. Всі повод скидки що зустрічаються + оцінка "подарункові"
    # ============================================================================
    print('\n' + '=' * 80)
    print('ВСІ ПОВОД СКИДКИ (для визначення "подарункових"):')
    print('=' * 80)

    discount_stats = defaultdict(lambda: {'rows': 0, 'clients': set()})
    for r in rows:
        d = r['discount']
        if not d:
            continue
        discount_stats[d]['rows'] += 1
        discount_stats[d]['clients'].add(r['code'])

    print(f'Всього {len(discount_stats)} унікальних повод скидки\n')

    # Групуємо по префіксу бренду
    grouped = defaultdict(list)
    for name, s in discount_stats.items():
        # Витягуємо перше слово / бренд
        name_low = name.lower()
        if 'petaran' in name_low:
            grouped['Petaran'].append((name, s['rows'], len(s['clients'])))
        elif 'ellanse' in name_low or 'еланс' in name_low:
            grouped['Ellanse'].append((name, s['rows'], len(s['clients'])))
        elif 'vitaran' in name_low or 'вітаран' in name_low:
            grouped['Vitaran'].append((name, s['rows'], len(s['clients'])))
        elif 'neuronox' in name_low or 'ботулотоксин' in name_low or 'токсин' in name_low:
            grouped['Neuronox'].append((name, s['rows'], len(s['clients'])))
        elif 'exoxe' in name_low or 'ехохе' in name_low:
            grouped['EXOXE'].append((name, s['rows'], len(s['clients'])))
        elif 'neuramis' in name_low or 'neuromed' in name_low:
            grouped['Neuramis'].append((name, s['rows'], len(s['clients'])))
        elif 'esse' in name_low:
            grouped['ESSE'].append((name, s['rows'], len(s['clients'])))
        elif 'iuse' in name_low:
            grouped['IUSE'].append((name, s['rows'], len(s['clients'])))
        elif 'collagen' in name_low or 'колаген' in name_low:
            grouped['Collagen'].append((name, s['rows'], len(s['clients'])))
        else:
            grouped['(інше)'].append((name, s['rows'], len(s['clients'])))

    for brand in sorted(grouped.keys()):
        items = sorted(grouped[brand], key=lambda x: -x[1])
        print(f'\n--- {brand} ({len(items)} промо) ---')
        for name, r, c in items[:15]:
            gift_flag = ' 🎁' if is_gift(name) else ''
            print(f'  {r:>4} рядків / {c:>4} клієнтів  {name[:75]}{gift_flag}')


if __name__ == '__main__':
    main()
