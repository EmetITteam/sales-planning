-- ============================================================================
-- Migration 048: планові показники PETARAN — фокуси + рівні лояльності
-- Created 2026-07-06
-- ============================================================================
--
-- Зберігаємо ПЛАН (цілі помісячно, травень–листопад 2026) для 3 блоків PETARAN,
-- щоб на дашборді рахувати факт vs план. Джерело — планова таблиця користувача
-- (3 блоки: Воронка / Рівні / Реактивація). Факт рахується з `sales` окремо.
--
-- Long-формат: рядок = (блок, показник, рік, місяць) → target. goal/conversion_pct
-- — константи показника (повторюються по місяцях, для зручності читання).
-- reactivation_base = 334 (пул бази на реактивацію) — лише для block='reactivation'.
--
-- Місяці без плану (прочерк у таблиці) збережені як target=0.
-- ============================================================================

CREATE TABLE IF NOT EXISTS petaran_loyalty_targets (
  id                BIGSERIAL PRIMARY KEY,
  block             TEXT NOT NULL CHECK (block IN ('funnel','levels','reactivation')),
  indicator_key     TEXT NOT NULL,
  indicator_label   TEXT NOT NULL,
  row_order         INT  NOT NULL,
  goal              NUMERIC,           -- Ціль (сезонна сума)
  conversion_pct    NUMERIC,           -- планова конверсія, %
  reactivation_base INT,               -- база на реактивацію (334), лише reactivation
  year              INT  NOT NULL,
  month             INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  target            NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (block, indicator_key, year, month)
);

-- Хелпер: вставка показника з масивом target по місяцях 5..11 (парний unnest).
-- ON CONFLICT — щоб міграція була ідемпотентною (повторний запуск оновлює цілі).
DO $$
DECLARE
  MONTHS int[] := ARRAY[5,6,7,8,9,10,11];
BEGIN
  -- ── БЛОК 1: Воронка (нові клієнти) ─────────────────────────────────────
  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'funnel','new_99','Нові лікарі · 1-а закупка Petaran −30% ($99)',1,325,0,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[49,98,98,81,0,0,0]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'funnel','conv_1_2','Конверсія 1-а → 2-а (2 Petaran×$135 + Vitaran Tox Eye)',2,260,80,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[0,39,78,78,65,0,0]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'funnel','conv_2_3','Конверсія 2-а → 3-я (спецпропозиція $130)',3,136,52,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[0,0,20,41,41,34,0]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'funnel','active_monthly','Лікарі, що стали активними (купують щомісяця)',4,68,50,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[0,0,0,10,20,20,17]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct;

  -- ── БЛОК 2: Рівні лояльності ───────────────────────────────────────────
  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'levels','level_standard','Рівень Стандарт (активні)',1,84,NULL,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[84,84,84,94,115,135,152]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'levels','level_bronze','Рівень Бронза (5+ фл/міс)',2,24,NULL,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[24,24,24,24,24,24,24]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'levels','level_silver','Рівень Срібло (10+ фл/міс)',3,10,NULL,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[10,10,10,10,10,10,10]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'levels','level_gold','Рівень Золото (20+ фл/міс)',4,4,NULL,NULL,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[4,4,4,4,4,4,4]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal;

  -- ── БЛОК 3: Реактивація (база = 334) ───────────────────────────────────
  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'reactivation','react_first','Перша закупка після перерви',1,100,30,334,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[15,30,30,25,0,0,0]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct,reactivation_base=EXCLUDED.reactivation_base;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'reactivation','react_conv_1_2','Конверсія 1-а → 2-а (2 Petaran×$135 + Vitaran Tox Eye)',2,84,84,334,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[0,13,25,25,21,0,0]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct,reactivation_base=EXCLUDED.reactivation_base;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'reactivation','react_conv_2_3','Конверсія 2-а → 3-я (спецпропозиція $130, до 30 днів)',3,56,67,334,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[0,0,8,17,17,14,0]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct,reactivation_base=EXCLUDED.reactivation_base;

  INSERT INTO petaran_loyalty_targets (block,indicator_key,indicator_label,row_order,goal,conversion_pct,reactivation_base,year,month,target)
  SELECT 'reactivation','react_returned','Лікарі, що повернулись у статус Активний',4,56,100,334,2026,m.month,m.target
  FROM unnest(MONTHS, ARRAY[0,0,0,8,17,17,14]::numeric[]) AS m(month,target)
  ON CONFLICT (block,indicator_key,year,month) DO UPDATE SET target=EXCLUDED.target,goal=EXCLUDED.goal,conversion_pct=EXCLUDED.conversion_pct,reactivation_base=EXCLUDED.reactivation_base;
END $$;
