-- ============================================================================
-- Migración: Anexos ligados a una cuenta de cobro
-- Fecha: 2026-07-30
-- Descripción: Hasta ahora un soporte (RUT, cédula) se archivaba contra la CAJA,
--              así que no había forma de saber a qué cuenta de cobro pertenecía.
--              Con `invoice_id` el residente puede mandar el RUT hoy y la cédula
--              otro día, y cada anexo queda colgado del gasto correcto.
--
--              El anexo sigue viviendo en box_documents (no en invoices): no
--              tiene valor, no descuenta saldo y no entra en la legalización.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. box_documents.invoice_id
-- ────────────────────────────────────────────────────────────────────────

-- NULL = el soporte acompaña a la caja en general (o llegó sin que se pudiera
-- determinar de qué cuenta de cobro es, y un admin lo ubicará después).
ALTER TABLE box_documents
  ADD COLUMN IF NOT EXISTS invoice_id UUID NULL REFERENCES invoices (id);

COMMENT ON COLUMN box_documents.invoice_id IS
  'Cuenta de cobro (o factura) a la que acompaña este soporte. NULL = anexo de la caja en general.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. ÍNDICES
-- ────────────────────────────────────────────────────────────────────────

-- "¿Qué anexos tiene esta cuenta de cobro?" y "¿le falta el RUT?": las dos
-- consultas que corren en cada mensaje de WhatsApp y en la cola de aprobación.
CREATE INDEX IF NOT EXISTS idx_box_documents_invoice
  ON box_documents (invoice_id, doc_type)
  WHERE invoice_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────────────────

-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'box_documents' AND column_name = 'invoice_id';
--
-- SELECT i.document_type, count(d.id) AS anexos
-- FROM invoices i LEFT JOIN box_documents d ON d.invoice_id = i.id
-- GROUP BY i.document_type;
