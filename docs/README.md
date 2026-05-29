# Документація Sales Planning

Навігаційний індекс по `docs/`. Розділено за призначенням.

---

## Активні специфікації

| Файл | Призначення |
|---|---|
| [1C_API_SPECIFICATION.md](./1C_API_SPECIFICATION.md) | Повна специфікація 12 actions 1С HTTP-сервісу (v2.7). Запити, відповіді, edge cases, тестові чек-лісти. |
| [ARCHITECTURE_INVARIANTS.md](./ARCHITECTURE_INVARIANTS.md) | Список захищених від видалення/рефакторингу компонентів + 15 розділів архітектурних правил. Читати перед будь-яким cleanup-ом. |
| [1C_EMBED_SPEC.md](./1C_EMBED_SPEC.md) | Embed нашого UI у клієнт 1С (на випадок коли знадобиться). |

## Operational

| Файл | Призначення |
|---|---|
| [BACKUPS.md](./BACKUPS.md) | Стратегія резервного копіювання Supabase. Auto cron + manual workflow. |
| [CHECKLIST_NEXT_PROJECT.md](./CHECKLIST_NEXT_PROJECT.md) | Чек-ліст для setup-у схожих проектів (Next.js + Supabase + 1С). |

## Backlog

| Файл | Призначення |
|---|---|
| [BACKLOG.md](./BACKLOG.md) | Поточний backlog (P0/P1/P2/P3). Тех-борг, баги, нові фічі, залежності. |

## Pending питання до 1С

| Файл | Призначення |
|---|---|
| [SPEC_PENDING_1C_ITEMS.md](./SPEC_PENDING_1C_ITEMS.md) | Єдине невиконане — Action B `getClientActivationPlan` (план активації по категоріях). |

## Архіви

| Файл | Призначення |
|---|---|
| [ARCHIVE_PLANS.md](./ARCHIVE_PLANS.md) | Виконані плани (PLAN V2 21-26.05 + План clients-page 26.05). |
| [ARCHIVE_SPECS_RESOLVED.md](./ARCHIVE_SPECS_RESOLVED.md) | Виконані специфікації (Action 5 `includeAll`, Action A `getClientFocus`, Action C `isReserved`, Bug 1 isReserved-sync, Bug 2 checkActivities, clientStats discrepancy). |

---

_Зведено 2026-05-28._
