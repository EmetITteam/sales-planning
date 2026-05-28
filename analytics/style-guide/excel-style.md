# Excel Style Guide — EMET Reports

Обов'язковий стиль для будь-якого xlsx-експорту. Винесено в бібліотечну функцію `export_xlsx()` — backend застосовує автоматично, але корисно розуміти.

## Палітра

| Призначення | Колір | Hex |
|---|---|---|
| Основний акцент (EMET) | EMET Blue | `#066AAB` |
| Темний текст | Чорний | `#0D0D0D` |
| Світло-сірий бордер | Сірий | `#D0D0D0` |
| Тепло-сірий (subtitles) | Warm grey | `#8B8680` |
| Шапка фон | EMET Blue | `#066AAB` |
| Band-fill (виділення колонки) | Світло-блакитний | `#E6F1F8` |
| Total-row fill | Світло-бежевий | `#F5F5F4` |
| Zebra (парний рядок) | Дуже світло-сірий | `#FAFAFA` |
| Positive accent | М'ятно-зелений | `#E8F0EC` |
| Negative accent | М'яко-рожевий | `#F5E1DC` |

## Шрифти

| Елемент | Шрифт | Розмір | Стиль |
|---|---|---|---|
| Title (велика шапка) | Cambria | 22 | Bold, чорний |
| Section header | Cambria | 14 | Bold, EMET Blue |
| Subtitle | Calibri | 11 | Italic, warm grey |
| Table header | Calibri | 10 | Bold, білий на синьому |
| Body | Calibri | 10 | Regular, чорний |
| Bold body (значущі цифри) | Calibri | 10 | Bold, чорний |
| Footnote | Calibri | 9 | Italic, warm grey |

## Структура листа

```
Row 1: Title (велика шапка, merge A1:Z1, height 46, bottom border medium EMET Blue)
Row 2: Subtitle (italic, warm grey, height 20)
Row 3: [порожньо]
Row 4: Table header (синій фон, білий жирний текст, height 26-32)
Row 5+: Дані з зеброю (парні рядки FAFAFA fill)
... (totals row якщо є — F5F5F4 fill, bold)
[+2 rows] Footnote: "Джерело: Продажі 1С" (НЕ шлях файлу!)
```

## Обов'язкові налаштування

```python
ws.sheet_view.showGridLines = False        # ховаємо grid
ws.sheet_properties.tabColor = '066AAB'    # синя вкладка
ws.freeze_panes = 'B5'                     # заморозити заголовки і ліву колонку
```

## Number formats

| Тип | Format string |
|---|---|
| Цілі числа | `'#,##0'` |
| Гроші USD | `'$#,##0'` (без копійок) або `'$#,##0.00'` |
| Відсотки | `'0.0%'` (значення зберігати як `pct/100`) |
| Дати | `'DD.MM.YYYY'` (європейський формат) |
| Коди клієнтів | `'@'` (як текст, щоб не зрізало лідуючі нулі: `000017247`) |

## Borders

```python
THIN = Border(
    left=Side(style='thin', color='D0D0D0'),
    right=Side(style='thin', color='D0D0D0'),
    top=Side(style='thin', color='D0D0D0'),
    bottom=Side(style='thin', color='D0D0D0'),
)
BOTTOM_BLUE = Border(bottom=Side(style='medium', color='066AAB'))
```

Title-row отримує `BOTTOM_BLUE`. Усі data-cells — `THIN` зі світло-сірим.

## Alignment

| Тип | horizontal | vertical | wrap |
|---|---|---|---|
| Header | center | center | True |
| Текст у першій колонці (мітки) | left | center | True |
| Числа | right | center | False |
| Title | left | center | False |

## Колір-кодування метрик

- **Bold + м'ятно-зелений фон** (#E8F0EC) — позитивний/важливий показник (наприклад "Усього клієнтів")
- **Bold + рожевий фон** (#F5E1DC) — негативний показник (повернення, втрати)
- Решта — нейтрально

## ❌ Чого НЕ робити

1. **Не починати клітинки з `=`, `+`, `-`** — Excel інтерпретує як формулу і ламається.
   - ❌ `= РЕАЛЬНА БАЗА` → буде `#ИМЯ?`
   - ✅ `Σ РЕАЛЬНА БАЗА` або `Σ за період`

2. **Не показувати технічні шляхи файлів у footnote.**
   - ❌ `Файл: c:\Users\...\data\База с 01.01.2025.txt`
   - ✅ `Джерело: Продажі 1С`

3. **Не виводити рядки перевірки сум у звіт.** Якщо треба перевірити що дані сходяться — у консоль, не в xlsx.

4. **Не використовувати яскраві емоджі-кольори** (червоний-зелений-жовтий світлофор) — користувачка явно не любить generic AI estetic. EMET-блакитний — основний.

5. **Не робити merged cells крім title-row і коротких 2-рівневих headers.** Складніше навігувати.

6. **Не зберігати коди клієнтів як числа.** Інакше зникають лідуючі нулі.

## ✅ Чек-лист перед save()

- [ ] Заморожено заголовки (`freeze_panes = 'B5'` або `'A5'`)
- [ ] Прибрано grid lines
- [ ] Колір вкладки = `#066AAB`
- [ ] Title в Cambria 22, bold
- [ ] Шапки в синьому фоні з білим жирним текстом
- [ ] Зебра на парних рядках
- [ ] Числа форматовані (`#,##0`, `$#,##0`, `0.0%`)
- [ ] Коди клієнтів як `'@'`
- [ ] Footnote: "Джерело: Продажі 1С" (НЕ шлях)
- [ ] Немає клітинок що починаються з `=`, `+`, `-`
- [ ] Ширина колонок підібрана (не дефолтні 8 і не 100)

## Бібліотечна функція (для backend)

Файл `src/lib/analytics/excel-export.ts` має одну public функцію:

```typescript
export async function exportXlsx(spec: ExcelSpec): Promise<string> {
  // ... повертає public URL для завантаження
}

interface ExcelSpec {
  filename: string;        // 'Сплячі_ESSE_B2B_26.05.2026.xlsx'
  sheets: SheetSpec[];
}

interface SheetSpec {
  name: string;            // 'Сплячі B2B'
  title: string;           // "ESSE · сплячі клієнти B2B"
  subtitle?: string;       // "Recency 91-180 днів, REF_DATE 26.05.2026"
  columns: ColumnSpec[];
  rows: any[][];
  totals?: any[];          // нижній рядок Σ
  footnote?: string;       // "Джерело: Продажі 1С"
}

interface ColumnSpec {
  header: string;
  width?: number;
  format?: '#,##0' | '$#,##0' | '0.0%' | '@' | 'DD.MM.YYYY';
  align?: 'left' | 'right' | 'center';
  accent?: 'positive' | 'negative';  // для viewability
}
```

AI у відповіді просто формує `ExcelSpec` (через tool call), бібліотека сама застосовує стиль. AI не повинна знати про hex-кольори, шрифти і freeze_panes.

## Зразок-донор
`scripts/petaran_cohorts_2025_2026.py` (у репо `product-analytics`) — найповніший приклад правильного стилю. Використовується як донор для нових скриптів.

## Why
5+ ітерацій з користувачем 2026-05 — спочатку всі дизайни (Trading Desk, Material, кольорові) відхилено як "не очень". Settled на minimal EMET-blue + Cambria + Calibri. Будь-який інший стиль — повернеться з фідбеком. Цей style guide замикає процес.
