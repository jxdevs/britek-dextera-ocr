-- ============================================================================
-- Migración: Papelera de facturas (soft delete con retención de 30 días)
-- Fecha: 2026-07-28
-- Descripción: Las facturas dejan de borrarse físicamente. El botón de eliminar
--              ahora marca `deleted_at` (paranoid de Sequelize): la factura sale
--              de todas las vistas y se puede restaurar durante 30 días. Pasado
--              ese plazo deja de listarse en la papelera, pero la fila NO se
--              borra nunca.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ATENCIÓN: `deleted_at` es obligatoria para que la API arranque.     ║
-- ║  Sin ella, toda consulta de facturas falla (Sequelize añade el       ║
-- ║  filtro "deleted_at IS NULL"). Ejecutar ANTES de desplegar.          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. NUEVAS COLUMNAS EN invoices
-- ────────────────────────────────────────────────────────────────────────

-- 1a. deleted_at — marca de papelera. NULL = factura activa.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN invoices.deleted_at IS
  'Momento en que se envió a la papelera. NULL = activa. La fila nunca se borra.';

-- 1b. deleted_by — quién la envió a la papelera. Sin FK: el modelo no declara
--     la asociación para no volver ambiguos los joins con worker_id.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 2. ÍNDICES
-- ────────────────────────────────────────────────────────────────────────

-- Todas las consultas normales filtran "deleted_at IS NULL": este índice
-- parcial cubre el caso frecuente sin indexar las filas de la papelera.
CREATE INDEX IF NOT EXISTS idx_invoices_activas
  ON invoices (status)
  WHERE deleted_at IS NULL;

-- Listado de la papelera, ordenado por fecha de borrado.
CREATE INDEX IF NOT EXISTS idx_invoices_papelera
  ON invoices (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- 3. NUEVA ACCIÓN 'restore' EN EL ENUM DE AUDITORÍA
-- ────────────────────────────────────────────────────────────────────────

-- ALTER TYPE ... ADD VALUE va fuera de la transacción anterior a propósito:
-- en PostgreSQL el nuevo valor no puede usarse en la misma transacción que
-- lo crea.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'restore'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_audit_logs_action')
  ) THEN
    ALTER TYPE "enum_audit_logs_action" ADD VALUE 'restore' AFTER 'delete';
  END IF;
END
$$;

-- ────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'invoices' AND column_name IN ('deleted_at', 'deleted_by');
--
-- Facturas activas vs. en papelera:
-- SELECT count(*) FILTER (WHERE deleted_at IS NULL)     AS activas,
--        count(*) FILTER (WHERE deleted_at IS NOT NULL) AS en_papelera
-- FROM invoices;
--
-- SELECT unnest(enum_range(NULL::enum_audit_logs_action));
