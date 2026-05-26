# 📡 Питання для Андрія: clientStats — розбіжність сум у Action 5

**Дата:** 2026-05-26
**Контекст:** Admin-дашборд «Огляд компанії», hero «Покупці місяця» + велика картка «Клієнти-покупці по категоріях»

## Що ми бачимо

На фільтрі «Усі підрозділи» (агрегат тільки Представництва + Колл-центр):

| Картка | Значення |
|---|---|
| Hero «Покупці місяця» | **1218 / 9111** (13.4% активність) |
| Велика картка — сума categoryBought | 1059 + 105 + 139 + 108 + 32 = **1443** |
| Велика картка — сума categoryTotal | 2967 + 1369 + 391 + 4988 + 3054 = **12769** |

**Розбіжності:**
- totalBought (1218) **vs** Σ category.bought (1443) → **різниця 225**
- totalClients (9111) **vs** Σ category.total (12769) → **різниця 3658**

## Що каже клієнт

«Категорія у клієнта одна (Активний/Сплячий/Втрачений/Новий/Без закупок). Перетинів немає».

Якщо це так — сума по 5 категоріях має дорівнювати totalClients.

## Що ми робимо у backend (`/api/admin/company-overview/route.ts`)

Агрегуємо clientStats per division як суму всіх менеджерів регіону:

```typescript
for (const reg of a5.data.regions) {
  for (const mgr of reg.managers) {
    if (mgr.clientStats) {
      slot.clientStats.active.total   += toNum(mgr.clientStats.active.total);
      slot.clientStats.active.bought  += toNum(mgr.clientStats.active.bought);
      // ... etc для sleeping/lost/new/none
      slot.clientStats.totalClients  += toNum(mgr.clientStats.totalClients);
      slot.clientStats.totalBought   += toNum(mgr.clientStats.totalBought);
    }
  }
}
```

Тобто **наш сумбіратор симетричний** — якщо для кожного менеджера сума категорій = totalClients, то і для дашборду має сходитись. **Якщо не сходиться — проблема у даних 1С per manager.**

## Можливі причини (теорії)

### A. Один клієнт у двох менеджерах (multi-region)

Якщо клієнт обслуговується двома менеджерами (наприклад, Пашковська + хтось з Миколаєва), 1С може повертати його у clientStats обох. Тоді:
- totalClients сума = unique count × 1.X (з дублікатами)
- Categories.total сума = той самий клієнт враховується у двох категоріях (якщо різні)

Це пояснило би розбіжність 12769 vs 9111. Але не пояснило би differing ratio (1218 vs 1443 — тільки 225 різниці у bought).

### B. 1С повертає (client, segment) pairs у категоріях

Якщо `categories.X.total` рахує НЕ клієнтів, а пари (клієнт, бренд), то один клієнт що купує 3 бренди буде у `active.total = 3`. Сума категорій тоді буде 3-9 × totalClients.

12769 / 9111 ≈ 1.4. Якщо це per-(client, segment) — то у середньому 1.4 бренди на клієнта. Це **можливо** реалістично.

### C. Інше — наприклад totalClients не включає «Без закупок»

«Без закупок» = 3054. Якщо totalClients = active + sleeping + lost + new (БЕЗ none) то:
9111 + 3054 = 12165 ≠ 12769 (близько але не точно).

## Що нам потрібно від тебе

**Один з варіантів:**

1. **Підтвердити який варіант** (A / B / C / інший) і де у документації про це сказано.
2. **Якщо A** — додати дедуплікацію на стороні 1С (повертати клієнта лише в одному менеджері — головному).
3. **Якщо B** — змінити документацію щоб ясно було «categories.X.total = (client, segment) pairs», ми тоді переробимо UI логіку.
4. **Якщо C** — підтвердити, ми додамо «Без закупок» окремо у наш UI агрегат.

## Як перевірити з твого боку

Запит до 1С (як директор):
```bash
curl -X POST https://1c.emet.in.ua/emet_test/hs/CRM \
  -u "login:password" \
  -H "Content-Type: application/json" \
  -d '{"action":"getRegionData","payload":{"login":"sdu@emet.in.ua","period":"2026-05","includeAll":true}}'
```

Для одного менеджера (наприклад Київ — Жук Анна):
- Записати `totalClients`
- Записати суму `active.total + sleeping.total + lost.total + new.total + none.total`
- Якщо НЕ збігаються → пояснити чому

## Терміни

Без блокеру. Зараз ми показуємо обидва числа на дашборді як є з warning-коментарем у коді. Менеджери можуть запитати «чому 1218 а не 1443» — нам треба чітка відповідь.

---

_Підготовлено 2026-05-26. У продовження SPEC_ACTION5_INCLUDE_ALL.md._
