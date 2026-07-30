-- ============================================================================
-- Migración: El código de caja deja de ser único
-- Fecha: 2026-07-30
-- Descripción: `petty_cash_boxes.code` era UNIQUE, así que no se podía abrir
--              una caja con un código ya usado por otro residente (p. ej.
--              "CAJA No 24" en dos residentes distintos → "Ya existe una caja
--              con code"). El código es solo una etiqueta de presentación: no
--              se usa para buscar ni referenciar cajas (todas las relaciones
--              van por `id` UUID). Se elimina la restricción de unicidad y se
--              deja un índice normal para que los listados sigan siendo rápidos.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. ELIMINAR LA UNICIDAD DE petty_cash_boxes.code
-- ────────────────────────────────────────────────────────────────────────

-- El nombre de la restricción depende de cómo se creó la tabla (sync de
-- Sequelize la llama petty_cash_boxes_code_key, pero puede diferir). Se buscan
-- dinámicamente TODAS las restricciones e índices únicos que cubran solo la
-- columna `code` y se eliminan.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1a. Restricciones UNIQUE / PRIMARY KEY de una sola columna sobre `code`
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    WHERE cls.relname = 'petty_cash_boxes'
      AND con.contype = 'u'
      AND con.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = cls.oid AND attname = 'code')
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE petty_cash_boxes DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Restricción única eliminada: %', r.conname;
  END LOOP;

  -- 1b. Índices únicos sueltos (creados con CREATE UNIQUE INDEX, sin
  --     restricción asociada: el paso anterior no los alcanza)
  FOR r IN
    SELECT idx_cls.relname AS indexname
    FROM pg_index idx
    JOIN pg_class idx_cls ON idx_cls.oid = idx.indexrelid
    JOIN pg_class tbl_cls ON tbl_cls.oid = idx.indrelid
    WHERE tbl_cls.relname = 'petty_cash_boxes'
      AND idx.indisunique
      AND NOT idx.indisprimary
      AND idx.indnatts = 1
      AND idx.indkey[0] = (
        SELECT attnum FROM pg_attribute
          WHERE attrelid = tbl_cls.oid AND attname = 'code'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
    RAISE NOTICE 'Índice único eliminado: %', r.indexname;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 2. ÍNDICE NO ÚNICO DE REEMPLAZO
-- ────────────────────────────────────────────────────────────────────────

-- Sin el índice de la restricción única, los filtros y ordenamientos por
-- código quedarían sin soporte. Este lo cubre, permitiendo duplicados.
CREATE INDEX IF NOT EXISTS idx_petty_cash_boxes_code
  ON petty_cash_boxes (code);

COMMENT ON COLUMN petty_cash_boxes.code IS
  'Código de la caja. Etiqueta informativa: puede repetirse entre residentes.';

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (ejecutar aparte; no debe devolver filas)
-- ============================================================================
-- SELECT con.conname
-- FROM pg_constraint con
-- JOIN pg_class cls ON cls.oid = con.conrelid
-- WHERE cls.relname = 'petty_cash_boxes' AND con.contype = 'u';
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'petty_cash_boxes';
-- ============================================================================
