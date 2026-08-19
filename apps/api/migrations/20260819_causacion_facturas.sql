-- ============================================================================
-- Migración: Causación contable de facturas
-- Fecha: 2026-08-19
-- Descripción: Nuevo paso posterior a la legalización. Una vez la factura está
--              legalizada (status = 'approved'), un admin confirma que ya fue
--              causada en contabilidad. Es un estado independiente de `status`
--              (no se toca el enum): `accrued_at IS NULL` = pendiente de causar.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. NUEVAS COLUMNAS EN invoices
-- ────────────────────────────────────────────────────────────────────────

-- 1a. accrued_at — momento de la causación. NULL = pendiente de causar.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS accrued_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN invoices.accrued_at IS
  'Momento en que un admin confirmó la causación contable. NULL = pendiente de causar. Independiente de status.';

-- 1b. accrued_by — quién la marcó. Sin FK, igual que deleted_by: el modelo no
--     declara la asociación para no volver ambiguos los joins con worker_id.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS accrued_by UUID DEFAULT NULL;

COMMENT ON COLUMN invoices.accrued_by IS
  'Usuario (workers.id) que confirmó la causación. Sin FK a propósito.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. ÍNDICES
-- ────────────────────────────────────────────────────────────────────────

-- Contador "pendientes de causación" por caja: legalizadas sin causar.
CREATE INDEX IF NOT EXISTS idx_invoices_pendientes_causacion
  ON invoices (box_id)
  WHERE deleted_at IS NULL AND status = 'approved' AND accrued_at IS NULL;

-- Contador "causadas" por caja.
CREATE INDEX IF NOT EXISTS idx_invoices_causadas
  ON invoices (box_id)
  WHERE deleted_at IS NULL AND accrued_at IS NOT NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'invoices' AND column_name IN ('accrued_at', 'accrued_by');
--
-- Causadas vs. pendientes de causación (solo facturas activas):
-- SELECT count(*) FILTER (WHERE accrued_at IS NOT NULL)                       AS causadas,
--        count(*) FILTER (WHERE status = 'approved' AND accrued_at IS NULL)   AS pendientes
-- FROM invoices
-- WHERE deleted_at IS NULL;
