-- ============================================================================
-- Migración: Tipos de documento y anexos de caja
-- Fecha: 2026-07-28
-- Descripción: Separa lo que los residentes suben en tres cosas distintas:
--                1. factura        → gasto, descuenta de la caja  (invoices)
--                2. cuenta de cobro → gasto, descuenta de la caja  (invoices)
--                3. soporte         → NO es gasto, solo se archiva (box_documents)
--              Los soportes (RUT, cédula, cámara de comercio) van en su propia
--              tabla para que no puedan colarse en saldos, KPIs, la cola de
--              aprobación ni el Excel de legalización.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Ejecutar ANTES de desplegar: la API consulta invoices.document_type ║
-- ║  y la tabla box_documents desde el arranque.                         ║
-- ╚══════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TIPOS ENUM
-- ────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_invoices_document_type') THEN
    CREATE TYPE "enum_invoices_document_type" AS ENUM ('factura', 'cuenta_cobro');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_box_documents_doc_type') THEN
    CREATE TYPE "enum_box_documents_doc_type" AS ENUM (
      'rut', 'cedula', 'camara_comercio', 'certificacion_bancaria', 'otro'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_box_documents_source') THEN
    CREATE TYPE "enum_box_documents_source" AS ENUM ('manual', 'auto');
  END IF;
END
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 2. invoices.document_type
-- ────────────────────────────────────────────────────────────────────────

-- Todo lo cargado hasta hoy se procesó como factura, así que ese es el default
-- y el backfill correcto para las filas existentes.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_type "enum_invoices_document_type"
  NOT NULL DEFAULT 'factura';

COMMENT ON COLUMN invoices.document_type IS
  'factura | cuenta_cobro. Ambos descuentan de la caja; cambian las reglas de validación (la cuenta de cobro se identifica con cédula y no lleva IVA ni CUFE).';

-- ────────────────────────────────────────────────────────────────────────
-- 3. TABLA box_documents — soportes que solo se archivan
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS box_documents (
  id             UUID PRIMARY KEY,
  box_id         UUID NULL REFERENCES petty_cash_boxes (id),
  worker_id      UUID NULL REFERENCES workers (id),
  doc_type       "enum_box_documents_doc_type" NOT NULL DEFAULT 'otro',
  description    VARCHAR(255) NULL,
  file_url       VARCHAR(255) NOT NULL,
  original_name  VARCHAR(255) NULL,
  mime_type      VARCHAR(100) NULL,
  size_bytes     INTEGER NULL,
  source         "enum_box_documents_source" NOT NULL DEFAULT 'manual',
  uploaded_by    UUID NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMP WITH TIME ZONE NULL
);

COMMENT ON TABLE box_documents IS
  'Soportes que acompañan a una caja menor sin ser un movimiento: RUT, cédula, cámara de comercio. No tienen valor ni se legalizan.';

COMMENT ON COLUMN box_documents.source IS
  'manual = adjuntado por un admin desde el detalle de la caja; auto = subido a la cola de facturas y reclasificado por la IA.';

COMMENT ON COLUMN box_documents.box_id IS
  'NULL cuando la IA archivó el soporte pero el residente tenía varias cajas abiertas (o ninguna) y hay que asignarlo a mano.';

-- Listado de documentos de una caja.
CREATE INDEX IF NOT EXISTS idx_box_documents_box
  ON box_documents (box_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Bandeja de soportes que quedaron sin caja asignada.
CREATE INDEX IF NOT EXISTS idx_box_documents_sin_caja
  ON box_documents (created_at DESC)
  WHERE box_id IS NULL AND deleted_at IS NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'invoices' AND column_name = 'document_type';
--
-- SELECT count(*) FROM information_schema.tables WHERE table_name = 'box_documents';
--
-- SELECT document_type, count(*) FROM invoices GROUP BY document_type;
