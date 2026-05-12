import { Type } from '@google/genai';

export const invoiceResponseSchema = {
  type: Type.OBJECT,
  properties: {
    vendor_nit: {
      type: Type.STRING,
      nullable: true,
      description: 'NIT o identificación tributaria del proveedor, sin puntos. Incluir dígito de verificación si aparece.',
    },
    vendor_name: {
      type: Type.STRING,
      description: 'Razón social o nombre comercial del proveedor.',
    },
    invoice_number: {
      type: Type.STRING,
      nullable: true,
      description: 'Número o consecutivo de la factura, ticket o documento equivalente.',
    },
    invoice_date: {
      type: Type.STRING,
      nullable: true,
      description: 'Fecha de la factura en formato ISO YYYY-MM-DD.',
    },
    subtotal: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Subtotal antes de impuestos, en la moneda detectada.',
    },
    iva: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Valor del IVA o impuesto al valor agregado.',
    },
    total: {
      type: Type.NUMBER,
      description: 'Total a pagar, impuestos incluidos.',
    },
    currency: {
      type: Type.STRING,
      nullable: true,
      description: 'Código ISO de moneda (COP, USD, etc.). Asume COP si no aparece.',
    },
    items: {
      type: Type.ARRAY,
      description: 'Líneas de la factura. Vacío si no se distinguen.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER, nullable: true },
          unit_price: { type: Type.NUMBER, nullable: true },
          total: { type: Type.NUMBER, nullable: true },
        },
        required: ['description'],
      },
    },
    confidence_score: {
      type: Type.NUMBER,
      description: 'Tu confianza global en la extracción, de 0 a 1. Baja a <0.6 si la imagen es ilegible, si no es una factura, o si campos clave están borrosos.',
    },
    notes: {
      type: Type.STRING,
      nullable: true,
      description: 'Observaciones cortas: campos ilegibles, anomalías, advertencias.',
    },
  },
  required: ['vendor_name', 'total', 'confidence_score'],
};

export const extractionPrompt = `Eres un asistente experto en extracción de datos de facturas y comprobantes de venta colombianos.

Recibirás una imagen. Tu tarea:

1. Determina si la imagen es una factura, recibo, ticket o documento de venta. Si NO lo es (selfie, captura aleatoria, foto borrosa sin texto, etc.), devuelve los campos disponibles con confidence_score < 0.3 y explica en "notes" por qué.
2. Si SÍ es una factura, extrae los campos del schema. Reglas:
   - Fechas SIEMPRE en formato ISO YYYY-MM-DD.
   - Números sin separadores de miles ni símbolo de moneda. Usa punto como separador decimal.
   - El NIT no debe contener puntos. Incluye el dígito de verificación con guion si aparece (ej: 900123456-7).
   - Si un campo no es legible o no aparece, déjalo en null en vez de inventar.
   - "items" puede ser una lista vacía si no se distinguen líneas.
3. Calibra confidence_score honestamente:
   - >= 0.85 → todos los campos clave legibles y consistentes (subtotal + iva ≈ total).
   - 0.6 – 0.85 → algunos campos dudosos o falta uno secundario.
   - < 0.6 → factura parcial, borrosa, o con campos clave ilegibles.

Responde SOLO con el JSON estructurado.`;
