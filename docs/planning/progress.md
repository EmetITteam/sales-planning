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
- Спринт-leader: Claude
- Артефакти: `decisions.md`, `findings.md`, `PROJECT_PLAN.md`, `progress.md`
- Затрачено: 1 робочий день
- Висновки: meeting-app = vanilla JS (не React) → переписуємо; reclamation-app = Python/FastAPI + Bitrix → microservice; orders backend = 0% → новий 1С action set потрібен

### Sprint 0.2 (2026-06-02) — Design exploration (dashboard)
- Завдання: 3 варіанти дашборду зустрічей у нашій glass-естетиці для вибору напрямку
- Артефакти у `public/`:
  - `design-meetings-dashboard.html` v1 — 3 варіанти (Timeline / Card Grid / Compact)
  - `design-meetings-dashboard-v2.html` — Card Grid polished (no emojis, 44px taps)
  - `design-meetings-dashboard-v3.html` — **🔒 FINAL (locked 2026-06-02)** — compact cards, day grouping, no floating meta, left-border for failed sync, purpose-as-subtitle з target icon, humanist KPI numbers
- Гілка: `feature/meetings-module`
- Коміти: `0e69320` (v1), `0c63d4a` (v2), `4ac82e2` (v3), `c61eff8` (v3 typography polish)
- Висновок: v3 = baseline для React-імплементації у Sprint 1.2 (Dashboard skeleton). v1 і v2 лишаємо як design history

### Sprint 0.3 (2026-06-02) — Design exploration (meeting form)
- Завдання: 2 варіанти форми зустрічі (новий + редагувати) у тій же v3-естетиці
- Артефакт: `public/design-meetings-form.html` (990 рядків) — commit `e811204`
- Варіанти:
  - **A — Bottom-sheet (mobile) / Modal-card (desktop)** — overlay поверх дашборду, контекст не втрачається
  - **B — Full-page** — окрема сторінка `/meetings/[id]/edit`
- Спільні primitives: ClientPicker, AddressField з geo readout (ADR-7 read-only), Date+Time inline, Purpose select, Comment textarea
- Висновок: **🔒 Variant A (Sheet/Modal) обрано** (рішення користувача 2026-06-02). Full-page відкидаємо. A = baseline для Sprint 1.3 (Meeting form у React)

### Sprint 0.4 (2026-06-02) — Stage 1.5 captured
- Завдання: нова вимога користувача — детальні line-items продажів з 1С у наш Postgres
- Артефакт: `docs/planning/stage-1.5-sales-detail.md` (DRAFT) — commit `a3079a5` (master)
- PROJECT_PLAN.md секція 3 — додано Stage 1.5 у стратегічну карту
- Відкрите: точний формат полів — користувач надішле зі скриптів аналітики
- Підтверджено: nightly cron + intra-day refresh для today, обидва actions (batch + per-client)

---

## Майбутні етапи (high-level)

| Етап | Скоуп | Орієнтовний старт |
|---|---|---|
| 0 | Архітектура + Дизайн | Поточний (тиждень 1) |
| 1 | Meetings | Тиждень 2 — 5 |
| **1.5** | **Sales Detail Foundation** (parallel зі Stage 1) | Тиждень 2 — 3 (після формату даних) |
| 2A | Debtors | Тиждень 5 — 6 |
| 2B | Reclamations | Тиждень 6 — 7 |
| 3 | Orders | Тиждень 7 — 12 |

---

## Open blockers

- **Stage 1.5 lock** — чекаю від користувача точний формат line-item полів (зі скриптів аналітики). До цього не можна писати спеку для 1С і не можна стартувати backfill.
- Жодних інших блокерів. Sprint 1.1 (Schema + Auth bridge + RLS) готовий до старту.

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
