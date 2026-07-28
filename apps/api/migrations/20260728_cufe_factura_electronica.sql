-- ============================================================================
-- Migración: CUFE / CUDE de facturación electrónica
-- Fecha: 2026-07-28
-- Descripción: Guarda el Código Único de Factura Electrónica (CUFE) —o el CUDE
--              de documentos equivalentes— extraído por la IA, para permitir la
--              validación posterior del documento ante la DIAN.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Si DB_SYNC=true, Sequelize aplica este cambio solo al reiniciar.    ║
-- ║  Este script es para entornos con DB_SYNC=false (staging/prod).      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. NUEVA COLUMNA EN invoices
-- ────────────────────────────────────────────────────────────────────────

-- CUFE (facturas electrónicas) o CUDE (documentos equivalentes, notas,
-- documento soporte). Ambos son 96 caracteres hexadecimales en minúsculas.
-- Se deja VARCHAR(100) y no CHAR(96) porque la extracción por OCR puede
-- devolver un código parcial que igual queremos conservar para revisión manual.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS cufe VARCHAR(100) DEFAULT NULL;

COMMENT ON COLUMN invoices.cufe IS
  'CUFE/CUDE de factura electrónica DIAN, normalizado a minúsculas sin espacios. NULL si el soporte no es electrónico.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL — recuperar el CUFE ya extraído en facturas históricas
-- ────────────────────────────────────────────────────────────────────────

-- Las extracciones previas al cambio no pedían el CUFE, así que extracted_data
-- normalmente no lo trae. Este UPDATE solo rescata los casos en que el modelo
-- lo devolvió de todas formas.
UPDATE invoices
SET cufe = lower(regexp_replace(extracted_data ->> 'cufe', '\s', '', 'g'))
WHERE cufe IS NULL
  AND extracted_data ? 'cufe'
  AND nullif(trim(extracted_data ->> 'cufe'), '') IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICE — detectar facturas electrónicas duplicadas
-- ────────────────────────────────────────────────────────────────────────

-- El CUFE es único por documento ante la DIAN: sirve para detectar el mismo
-- soporte subido dos veces. No se declara UNIQUE porque una lectura OCR
-- imperfecta podría colisionar y bloquear una carga legítima.
CREATE INDEX IF NOT EXISTS idx_invoices_cufe
  ON invoices (cufe)
  WHERE cufe IS NOT NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────

-- SELECT column_name, data_type, character_maximum_length
-- FROM information_schema.columns
-- WHERE table_name = 'invoices' AND column_name = 'cufe';
--
-- Facturas con CUFE de formato válido (96 hex):
-- SELECT count(*) FROM invoices WHERE cufe ~ '^[0-9a-f]{96}$';
