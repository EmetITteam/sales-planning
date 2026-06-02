# Best Manager Contest — Specification

**Status:** Locked 2026-06-02 (від PDF «Умови конкурсу Найкращій менеджер по ТМ», редакція червень 2026)
**Date:** 2026-06-02
**Owner:** Department of Sales (бізнес-правила) · Frontend (Claude — імплементація)
**Audience:** Director Dashboard + Огляд компанії
**Data source:** Stage 1.5 `sales_line_items` + existing plan data

---

## 1. Призначення

Автоматично визначати **переможця конкурсу «Найкращий менеджер по ТМ»** для кожного з 5 брендів за обраний період. Результат відображається на дашборді Директора і Огляді компанії — без ручних розрахунків у Excel.

---

## 2. Категорії конкурсу (5 брендів)

Для кожного — **один переможець** за період.

| # | Бренд | Метрика перемоги | Поріг участі |
|---|---|---|---|
| 1 | **Ellanse** | макс **сумарна кількість проданих упаковок** | ≥ 20 упаковок |
| 2 | **PETARAN** | макс **сумарна кількість одиниць** | ≥ 30 упаковок |
| 3 | **ESSE** | макс **сума продажів по ТМ** (USD) | ≥ $4,000 |
| 4 | **IUSE** (IUSE Collagen + IUSE hair + IUSE SB) | макс **сума продажів по ТМ** (USD) | ≥ $6,000 |
| 5 | **Vitaran** | макс **сума продажів по ТМ** (USD) | ≥ $10,000 |

---

## 3. Універсальні фільтри (для всіх 5 контестів)

1. **Виконання індивідуального плану менеджера ≥ 100%** — менеджер має закрити свій загальний план з продажів
2. **Виконання плану по ТМ ≥ 100%** — менеджер має закрити план по тій ТМ, за яку претендує на перемогу
3. **Виключення:** закупівлі **спікерів компанії НЕ зараховуються** — лінії з документами що мають заповнене поле «Семінар» виключаємо з розрахунку

---

## 4. Тайбрейкер

Якщо декілька менеджерів виконали всі умови та поріг участі, переможець — той у кого **найвищий % виконання плану по ТМ**.

**Приклад з PDF:**
- 3 менеджери виконали умови по бренду Ellanse
- Виконання плану по ELLANSE: 102%, 120%, 140%
- Переможець: 140%

---

## 5. Алгоритм розрахунку (псевдокод)

```typescript
async function determineBestManager(
  brand: 'ELLANSE' | 'PETARAN' | 'ESSE' | 'IUSE' | 'VITARAN',
  period: Period
): Promise<Winner | null> {
  // 1. Отримати всі продажі за період по бренду, виключаючи спікерів
  const items = await db.query(`
    SELECT manager_1c, qty, total_usd
    FROM sales_line_items
    WHERE segment_code = $1
      AND doc_date BETWEEN $2 AND $3
      AND (doc_seminar IS NULL OR doc_seminar = '')
  `, [brand, period.from, period.to]);

  // 2. Aggregate per manager (qty + sum)
  const perManager = groupBy(items, 'manager_1c').map(g => ({
    manager: g.key,
    qty: sum(g.items.map(i => i.qty)),
    totalUsd: sum(g.items.map(i => i.total_usd)),
  }));

  // 3. Поріг участі (qty для Ellanse/PETARAN, sum для ESSE/IUSE/Vitaran)
  const eligible = perManager.filter(m => meetsThreshold(m, brand));

  // 4. Фільтр: індивідуальний план ≥ 100%
  const withIndivPlan = await enrichWith(eligible, m =>
    getManagerIndividualPlanExecution(m.manager, period)
  );
  const passIndividual = withIndivPlan.filter(m => m.indivPlanPct >= 100);

  // 5. Фільтр: план по ТМ ≥ 100%
  const withBrandPlan = await enrichWith(passIndividual, m =>
    getManagerBrandPlanExecution(m.manager, brand, period)
  );
  const passBrand = withBrandPlan.filter(m => m.brandPlanPct >= 100);

  if (passBrand.length === 0) return null;  // ніхто не переміг

  // 6. Тайбрейкер — за brandPlanPct DESC
  return passBrand.sort((a, b) => b.brandPlanPct - a.brandPlanPct)[0];
}

function meetsThreshold(m: ManagerSales, brand: string): boolean {
  switch (brand) {
    case 'ELLANSE':  return m.qty >= 20;
    case 'PETARAN':  return m.qty >= 30;
    case 'ESSE':     return m.totalUsd >= 4000;
    case 'IUSE':     return m.totalUsd >= 6000;
    case 'VITARAN':  return m.totalUsd >= 10000;
    default:         return false;
  }
}
```

---

## 6. Що потрібно від 1С (додаткове до Stage 1.5)

Action `getDetailedSalesBatch` має повертати у кожному line-item:

| Поле | Призначення | Критичність |
|---|---|---|
| `segment_code` (Ellanse / PETARAN / ESSE / IUSE / Vitaran / інше) | Категоризація по бренду | 🔴 critical — без цього не можна порахувати |
| `doc_seminar` (заповнене якщо seminar-document) | Виключення спікерських покупок | 🔴 critical — інакше зарахуємо непотрібне |
| `manager_1c` (ідентифікатор сотрудника) | Розподіл per manager | 🔴 critical |
| Решта стандартних (qty, total_usd, doc_date) | Стандарт Stage 1.5 | 🔴 critical |

**Для IUSE:** 1С має або повертати «IUSE» як єдиний segment_code незалежно від того IUSE Collagen / hair / SB, або повертати окремі під-сегменти, які ми агрегуємо. Перевірити з 1С-розробником.

---

## 7. UI Surface

### 7.1 Огляд компанії — секція «🏆 Найкращі менеджери»

5 карток (по одній на бренд):

```
┌────────────────────────┐
│ 🏆 ELLANSE             │
│                        │
│ Іванов Петро           │
│ 42 упаковки · 140% плану│
│                        │
│ 2 у боротьбі ›         │
└────────────────────────┘
```

Період — поточний місяць за замовчуванням. Селектор: тиждень / місяць / квартал / рік.

### 7.2 Drill-down (клік по картці)

Список всіх «eligible»-менеджерів по цьому бренду:
- Імʼя
- Кількість/сума (метрика перемоги)
- Індивідуальний план %
- План по ТМ %
- Помітки (зеленим — той хто переміг; сірим — той хто не пройшов фільтр + причина)

### 7.3 Якщо нікого нема

Картка показує «У цьому періоді ніхто не виконав умови. Поріг: ≥ N упаковок / $N».

---

## 8. Sprint placement

Додаємо як **частину Stage 1.5 deliverables** — це перший видимий споживач даних що ми завантажуємо. Логіка:

- Stage 1.5.1-1.5.5 = data foundation (Sprint plan з stage-1.5-sales-detail.md)
- **Stage 1.5.6** = **Best Manager widget** (новий) — фронт + бізнес-логіка розрахунку
- Це підтверджує цінність Stage 1.5 при доставці

**Oцінка:** +2-3 дні frontend (UI + algo + tests).

---

## 9. Edge cases / Open items

1. **Що якщо «Контрагент.Сотрудник» (manager_1c) не відповідає logіну sales-planning?**
   - Можливо у 1С це ПІБ або кодний номер
   - Потрібен мапінг manager_1c → login (через users table?) або 1С має повертати email
   - Уточнити при імплементації 1.5.2

2. **Сегментація IUSE підбрендів** — підтвердити з 1С чи об'єднує сам, чи треба нам

3. **Періоди порівняння** — користувач хоче бачити кращих за поточний місяць, чи за квартал, чи комбіновано? Зараз за замовчуванням ставимо місяць; селектор додаємо.

4. **Архівні результати** — чи зберігати історію «переможців» (хто виграв у січні / лютому / ...)? Поки не зберігаємо, обчислюємо щоразу з sales_line_items + plan data.

5. **Notification** — чи треба автоматично сповіщати менеджерів-переможців у TG/email? Не зараз; додаємо як NTH.

---

_Документ оновлюється коли 1С підтвердить формат segment_code / doc_seminar, або коли користувач уточнить open items._
