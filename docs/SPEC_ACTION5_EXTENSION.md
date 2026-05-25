# 📡 Спека · Action 5 розширення для admin-дашборду

Документ для Андрія (1С розробник).

## Контекст

Робимо адмін-сторінку «Огляд по всій компанії». Там показуємо план/факт по ВСІХ 13 підрозділах включно з тими що зараз не потрапляють в Action 5.

## Проблема

`Action 5 getRegionData` зараз повертає тільки 9 з 13 підрозділів:

**Повертає (з фактом):**
- Київ, Дніпро, Одеса, Харків, Запоріжжя, Вінниця, Миколаєв, Житомир (8 представництв)
- Лазерхауз\*

**НЕ повертає (а треба):**
- Коллцентр Call center лидогенерация (код `000000060`)
- Адасса (код `000000120`)
- Полтава\* / дистрибутор Чугуй (код `000000042`)
- Черновцы\* / дистрибутор Хайленко (код `000000047`)

Action 4 `getRegistryPlans` повертає для всіх 13 підрозділів **тільки плани**. Факту нема.

## Що потрібно

Розширити Action 5 одним з варіантів:

### Варіант 1 (preferred) — прапор у payload

```json
// REQUEST
{
  "action": "getRegionData",
  "payload": {
    "login": "sdu@emet.in.ua",
    "period": "2026-05",
    "includeAll": true
  }
}
```

При `includeAll=true` повернути **всі 13 підрозділів** (без фільтру по active/архівні). При `includeAll=false` або відсутньому — поточна поведінка (9 підрозділів) — НЕ ламати existing dashboard-и.

### Варіант 2 (альтернатива) — новий action

Якщо у Action 5 складна логіка прав для РМ і не хочеться її ламати — окремий action:

```json
// REQUEST
{
  "action": "getCompanyData",
  "payload": { "period": "2026-05" }
}
```

Той самий response shape, але повертає всі 13 підрозділів. Доступний тільки для admin/director (по login перевірити роль).

## Очікувана структура відповіді

**Та сама що і зараз у Action 5** — `regions[]` з `managers[].segments[]`:

```json
// RESPONSE (success)
{
  "status": "success",
  "data": {
    "asOfDate": "2026-05-17",
    "prevMonthAsOfDate": "2026-04-30",
    "regions": [
      {
        "regionName": "Київ",
        "regionCode": "KYV",
        "managers": [
          {
            "managerName": "Бойко Ольга",
            "managerLogin": "sm.kiev4@emet.in.ua",
            "segments": [
              {
                "segmentCode": "PETARAN",
                "segmentName": "Petaran",
                "planAmountUSD": 22000,
                "factAmountUSD": 8140,
                "prevMonthFactUSD": 18000,
                "prevMonthPlanUSD": 20000,
                "prevMonthFactPercent": 90.0
              }
              /* ... інші сегменти ... */
            ],
            "totalPlan": 75782,
            "totalFact": 50480,
            "totalPrevMonthFact": 95900
          }
          /* ... інші менеджери регіону ... */
        ]
      },
      /* ... КЛЮЧОВЕ: ДОДАТИ ЦІ 4 РЕГІОНИ ... */
      {
        "regionName": "Коллцентр Call center лидогенерация",
        "regionCode": "000000060",
        "managers": [ /* як у звичайному регіоні, з фактом */ ]
      },
      {
        "regionName": "Адасса",
        "regionCode": "000000120",
        "managers": [ /* */ ]
      },
      {
        "regionName": "Полтава*",
        "regionCode": "000000042",
        "managers": [ /* може бути порожній якщо там плани без прив'язки до менеджера */ ]
      },
      {
        "regionName": "Черновцы*",
        "regionCode": "000000047",
        "managers": [ /* може бути порожній */ ]
      }
    ]
  }
}
```

## Особливі випадки

**1. Що якщо у підрозділі плани без менеджера (Action 4 показує `managerLogin=""`)?**

Тоді у відповіді віддавати штучного менеджера типу:
```json
{
  "managerName": "(без менеджера)",
  "managerLogin": "_division_000000042",  // унікальний id щоб не конфліктував з реальними
  "segments": [ /* агреговані плани/факт по підрозділу */ ],
  "totalPlan": 133646,
  "totalFact": 0,  // або справжній факт якщо є
  "totalPrevMonthFact": 0
}
```

АБО окремий синтетичний регіон з одним «менеджером» що зведений до підрозділу.

**2. Що якщо для підрозділу нема факту взагалі?**

Тоді `factAmountUSD: 0` для всіх сегментів, `totalFact: 0`. Це лучше ніж відсутність — нам треба ВСІ підрозділи у списку щоб показати «без факту».

**3. prevMonthFact для нових підрозділів**

Якщо нема даних минулого місяця — `prevMonthFactUSD: 0, prevMonthPlanUSD: 0, prevMonthFactPercent: null`.

## Тестовий запит для перевірки

```bash
curl -X POST https://1c.emet.in.ua/emet_test/hs/CRM \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getRegionData",
    "payload": {
      "login": "sdu@emet.in.ua",
      "period": "2026-05",
      "includeAll": true
    }
  }'
```

Очікую — масив з 13 елементів у `regions[]` (зараз 9-11).

## Спека існуючого Action 5

Повна типізація — у `docs/1C_API_SPECIFICATION.md` секція Action 5 / v2.4.

Це розширення = **v2.7** — параметр `includeAll` опціональний (default `false`), не ламає existing behaviour.

## Терміни

Без жорсткого дедлайну, нам не критично. Поки не зробите — у admin-дашборді показуємо «н/д» для цих 4 підрозділів (це ОК).

## Що зміниться на нашій стороні після твого деплою

1. Adapter `src/lib/onec-adapters.ts` приймає prop `includeAll`
2. У admin-сторінці викликаємо `getRegionData({ includeAll: true })` для повного списку
3. У РМ/Director дашбордах залишається `includeAll: false` (як зараз) — нічого не зміниться

---

_Підготувала Євгенія за допомогою Claude · 2026-05-25_
