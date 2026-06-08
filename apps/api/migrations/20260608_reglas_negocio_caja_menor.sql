-- ============================================================================
-- Migración: Reglas de Negocio — Caja Menor
-- Fecha: 2026-06-08
-- Descripción: Agrega campos y tipos requeridos para cumplir las políticas
--              de uso de Caja Menor (categorización, observaciones, bloqueo).
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  IMPORTANTE: Ejecutar en orden. Cada bloque es idempotente.        ║
-- ║  Si DB_SYNC=true está activo, estos cambios se aplican solos al    ║
-- ║  reiniciar el servidor. Este script es para entornos donde         ║
-- ║  DB_SYNC=false (staging/producción).                               ║
-- ╚══════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TIPOS ENUM
-- ────────────────────────────────────────────────────────────────────────

-- 1a. Agregar 'observed' al enum de status de invoices
-- Sequelize genera el tipo como "enum_invoices_status"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'observed'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_invoices_status')
  ) THEN
    ALTER TYPE "enum_invoices_status" ADD VALUE 'observed' AFTER 'pending';
  END IF;
END
$$;

-- 1b. Agregar 'blocked' al enum de status de petty_cash_boxes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'blocked'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_petty_cash_boxes_status')
  ) THEN
    ALTER TYPE "enum_petty_cash_boxes_status" ADD VALUE 'blocked' AFTER 'open';
  END IF;
END
$$;

-- 1c. Crear enum para categoría de gasto (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_invoices_expense_category') THEN
    CREATE TYPE "enum_invoices_expense_category" AS ENUM (
      'combustible', 'transporte', 'peajes', 'parqueaderos',
      'materiales', 'consumibles', 'alimentacion', 'otro'
    );
  END IF;
END
$$;

COMMIT;

-- NOTA: Los ALTER TYPE ADD VALUE no pueden ejecutarse dentro de una
-- transacción en algunas versiones de PostgreSQL. Si falla, ejecutar
-- los 3 bloques DO por separado fuera de BEGIN/COMMIT.

-- ────────────────────────────────────────────────────────────────────────
-- 2. NUEVAS COLUMNAS EN invoices
-- ────────────────────────────────────────────────────────────────────────

-- 2a. expense_category — categoría de gasto inferida por IA
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS expense_category "enum_invoices_expense_category" DEFAULT NULL;

-- 2b. requires_special_approval — true si la factura necesita aprobación de admin
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS requires_special_approval BOOLEAN NOT NULL DEFAULT false;

-- 2c. reported_late — true si submitted_at - invoice_date > 24 horas
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reported_late BOOLEAN NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────
-- 3. NUEVAS COLUMNAS EN petty_cash_boxes
-- ────────────────────────────────────────────────────────────────────────

-- 3a. expires_at — fecha límite de la caja (opened_at + 7 días)
ALTER TABLE petty_cash_boxes
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 4. BACKFILL — Rellenar expires_at para cajas existentes
-- ────────────────────────────────────────────────────────────────────────

-- Calcular expires_at = opened_at + 7 días para cajas que no lo tengan
UPDATE petty_cash_boxes
SET expires_at = opened_at + INTERVAL '7 days'
WHERE expires_at IS NULL
  AND opened_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 5. ÍNDICES DE RENDIMIENTO (opcionales pero recomendados)
-- ────────────────────────────────────────────────────────────────────────

-- Buscar cajas vencidas rápidamente (bloqueo lazy)
CREATE INDEX IF NOT EXISTS idx_petty_cash_boxes_expires
  ON petty_cash_boxes (status, expires_at)
  WHERE status = 'open' AND expires_at IS NOT NULL;

-- Buscar facturas por estado (tab de observadas)
CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices (status);

-- Buscar facturas pendientes/observadas de una caja (validación de legalización)
CREATE INDEX IF NOT EXISTS idx_invoices_box_status
  ON invoices (box_id, status)
  WHERE status IN ('pending', 'observed');

-- ────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────

-- Ejecutar después de la migración para verificar:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'invoices'
--   AND column_name IN ('expense_category', 'requires_special_approval', 'reported_late');
--
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'petty_cash_boxes'
--   AND column_name = 'expires_at';
