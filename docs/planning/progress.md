# Progress Tracker — CRM Розширення

**Поточний етап:** 0 — Architecture + Design Prep
**Початок:** 2026-06-02

---

## Etap 0: Підготовка ✅ Частково готово

| Завдання | Статус | Деталі |
|---|---|---|
| Audit `metting-4.0` (Explore-agent) | ✅ Done | `findings.md` секція 1 |
| Audit `meeting-app` (Explore-agent) | ✅ Done | `findings.md` секція 2 |
| Audit `reclamation-app` (manual) | ✅ Done | `findings.md` секція 3 |
| ADR-1..9 → `decisions.md` | ✅ Done | 9 ADR прийнято |
| `findings.md` із синтезом 3 аудитів | ✅ Done | |
| `PROJECT_PLAN.md` — головний документ плану | ✅ Done | v1 draft |
| Узгодити план з користувачем | ⏳ В очікуванні | Review цього draft |
| Design exploration (3-4 варіанти HTML) | ⏭ Pending | Після твердження плану |
| Feature-branch `feature/meetings-module` | ⏭ Pending | Після твердження плану |
| `docs/1C_NEW_ACTIONS_SPEC.md` | 🟡 Deferred | **Після узгодження повної логіки фіч** (рішення користувача 2026-06-02) |

---

## Sprint history

### Sprint 0.1 (2026-06-02) — Audit & Architecture
- Завдання: повний аудит 3 meeting-related репо, ADR, план
- Спринт-leader: команда фронтенду
- Артефакти: `decisions.md`, `findings.md`, `PROJECT_PLAN.md`, `progress.md`
- Затрачено: 1 робочий день
- Висновки: meeting-app = vanilla JS (не React) → переписуємо; reclamation-app = Python/FastAPI + Bitrix → microservice; orders backend = 0% → новий 1С action set потрібен

---

## Майбутні етапи (high-level)

| Етап | Скоуп | Орієнтовний старт |
|---|---|---|
| 0 | Архітектура + Дизайн | Поточний (тиждень 1) |
| 1 | Meetings | Тиждень 2 — 5 |
| 2A | Debtors | Тиждень 5 — 6 |
| 2B | Reclamations | Тиждень 6 — 7 |
| 3 | Orders | Тиждень 7 — 12 |

---

## Open blockers

- Жодних блокерів на даний момент. Чекаю review плану і «добро» на старт design exploration + feature-branch.

---

## Open questions (повний список у PROJECT_PLAN.md секція 15)

- Q1: Calendar sync depth
- Q2: Survey questions схема
- Q3: File upload у Add Client
- Q4: Bitrix webhook env-ization
- Q5: Reclamations widget формат
- Q6: Supabase Pro timing
- Q7: Director dashboard у meeting-app

---

_Файл оновлюється після кожного sprint або значного блокера._
