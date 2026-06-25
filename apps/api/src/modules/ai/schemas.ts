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
      description: 'Subtotal antes de impuestos. Valor numérico EXACTO. En Colombia el punto es separador de miles: "88.700" = 88700, NO 88.7.',
    },
    iva: {
      type: Type.NUMBER,
      nullable: true,
      description: 'Valor del IVA. Valor numérico EXACTO. "4.830" en factura colombiana = 4830, NO 4.83.',
    },
    total: {
      type: Type.NUMBER,
      description: 'Total a pagar, impuestos incluidos. Valor EXACTO sin redondear. "93.530" = 93530.',
    },
    currency: {
      type: Type.STRING,
      nullable: true,
      description: 'Código ISO de moneda (COP, USD, etc.). Asume COP si no aparece.',
    },
    expense_category: {
      type: Type.STRING,
      description:
        'Categoría del gasto inferida del contenido de la factura. ' +
        'Valores posibles: combustible, transporte, peajes, parqueaderos, materiales, consumibles, alimentacion, otro. ' +
        'Clasifica según el tipo de bien o servicio facturado.',
    },
    items: {
      type: Type.ARRAY,
      description: 'Líneas de la factura. Vacío si no se distinguen.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER, nullable: true, description: 'Cantidad exacta del item.' },
          unit_price: { type: Type.NUMBER, nullable: true, description: 'Precio unitario EXACTO. "5.500" = 5500.' },
          total: { type: Type.NUMBER, nullable: true, description: 'Total del item EXACTO. "5.500" = 5500, NO 5.5.' },
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
  required: ['vendor_name', 'total', 'confidence_score', 'expense_category'],
};

export const extractionPrompt = `Eres un asistente experto en extracción de datos de facturas y comprobantes de venta colombianos.

Recibirás una imagen. Tu tarea:

1. Determina si la imagen es una factura, recibo, ticket o documento de venta. Si NO lo es (selfie, captura aleatoria, foto borrosa sin texto, etc.), devuelve los campos disponibles con confidence_score < 0.3 y explica en "notes" por qué.
2. Si SÍ es una factura, extrae los campos del schema. Reglas:
   - Fechas SIEMPRE en formato ISO YYYY-MM-DD.
   - El NIT no debe contener puntos. Incluye el dígito de verificación con guion si aparece (ej: 900123456-7).
   - Si un campo no es legible o no aparece, déjalo en null en vez de inventar.
   - "items" puede ser una lista vacía si no se distinguen líneas.

   ⚠️ REGLAS CRÍTICAS PARA VALORES NUMÉRICOS (subtotal, iva, total, items.unit_price, items.total):
   - NUNCA redondees, trunces ni alteres los valores numéricos. Deben ser EXACTOS tal como aparecen en la factura.
   - En Colombia, el PUNTO (.) es separador de MILES y la COMA (,) es separador DECIMAL.
     Ejemplo: "5.500" en una factura colombiana significa CINCO MIL QUINIENTOS (5500), NO 5.5.
     Ejemplo: "1.200,50" significa MIL DOSCIENTOS CON CINCUENTA CENTAVOS (1200.50).
   - En tu respuesta JSON usa el formato numérico estándar: punto como decimal, sin separadores de miles.
     Ejemplo: "88.700" en la factura → 88700 en el JSON. "4.830" → 4830. "93.530" → 93530.
   - Si un precio dice "$5.500" extrae 5500, NO 5 ni 5.5.
   - Si un total dice "$88.700" extrae 88700, NO 88.7 ni 89.
   - Los valores de items (quantity, unit_price, total) también deben ser EXACTOS. Si un item dice "$5.500" el total es 5500.
   - NUNCA quites ceros. NUNCA dividas entre 1000. NUNCA interpretes puntos colombianos como decimales.

3. Clasifica el gasto en expense_category según el contenido:
   - "combustible" → gasolina, ACPM, gas vehicular.
   - "transporte" → taxis, plataformas de transporte, fletes.
   - "peajes" → peajes de carreteras.
   - "parqueaderos" → estacionamientos, parqueaderos.
   - "materiales" → materiales de construcción, ferretería, insumos de obra.
   - "consumibles" → papelería, aseo, útiles de oficina.
   - "alimentacion" → restaurantes, cafeterías, bebidas, alimentos.
   - "otro" → cualquier gasto que no encaje en las anteriores.
4. Calibra confidence_score honestamente:
   - Si falta el NIT (vendor_nit es null), el confidence_score NUNCA puede superar 0.10. El NIT es primordial.
   - >= 0.85 → todos los campos clave legibles y consistentes (subtotal + iva ≈ total), NIT presente.
   - 0.6 – 0.85 → algunos campos dudosos o falta uno secundario, NIT presente.
   - < 0.6 → factura parcial, borrosa, o con campos clave ilegibles.

Responde SOLO con el JSON estructurado.`;
