import { Type } from '@google/genai';

export const invoiceResponseSchema = {
  type: Type.OBJECT,
  properties: {
    document_kind: {
      type: Type.STRING,
      description:
        'Qué clase de documento es: "factura" (factura de venta, POS, tiquete, documento equivalente), ' +
        '"cuenta_cobro" (cuenta de cobro de persona natural por un servicio prestado), ' +
        '"soporte" (documento que NO es un gasto: RUT, cédula, cámara de comercio, certificación bancaria) ' +
        'o "ilegible" (no se distingue nada o no es ninguno de los anteriores).',
    },
    document_subtype: {
      type: Type.STRING,
      nullable: true,
      description:
        'Solo si document_kind = "soporte". Uno de: rut, cedula, camara_comercio, certificacion_bancaria, otro.',
    },
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
    cufe: {
      type: Type.STRING,
      nullable: true,
      description:
        'CUFE o CUDE de la factura electrónica DIAN: 96 caracteres hexadecimales (0-9, a-f) sin espacios. ' +
        'Transcríbelo completo y en minúsculas. null si el documento no lo trae impreso.',
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
  required: ['document_kind', 'vendor_name', 'total', 'confidence_score', 'expense_category'],
};

export const extractionPrompt = `Eres un asistente experto en documentos de soporte de caja menor en Colombia.

Recibirás una imagen. Tu tarea:

1. CLASIFICA el documento en "document_kind". Es el campo más importante: determina si el documento descuenta plata de la caja o solo se archiva.

   - "factura" → factura de venta, factura electrónica, tiquete POS, recibo de caja, documento equivalente.
     Señales: número de factura, NIT del establecimiento, discriminación de IVA, listado de productos, "FACTURA DE VENTA".

   - "cuenta_cobro" → una persona natural cobra por un servicio prestado (mano de obra, transporte, asesoría).
     Señales: el título dice "CUENTA DE COBRO"; va dirigida a una empresa ("Debe a", "A: Britek SAS");
     quien cobra se identifica con CÉDULA, no con NIT; casi nunca discrimina IVA; suele llevar firma manuscrita
     y a veces datos bancarios para la consignación. NO tiene número de factura ni CUFE.

   - "soporte" → el documento NO es un cobro, solo acompaña al expediente. Nunca tiene un valor a pagar.
     Ejemplos: copia del RUT, copia de la cédula, certificado de cámara de comercio, certificación bancaria.
     Señales: RUT → formulario 001 de la DIAN, casillas numeradas, "Registro Único Tributario".
     Cédula → documento de identidad, foto y huella. Cámara de comercio → "Certificado de existencia y representación legal".

   - "ilegible" → no es ninguno de los anteriores, o la imagen no permite distinguir nada
     (selfie, foto borrosa sin texto, captura aleatoria).

   Si document_kind es "soporte", rellena también "document_subtype" y NO te esfuerces en el resto:
   devuelve total = 0, los demás campos en null y confidence_score reflejando qué tan seguro estás de la
   CLASIFICACIÓN (no de la extracción). Un RUT perfectamente legible clasificado con certeza va con
   confidence_score alto aunque no tenga importes.

2. Si es "factura" o "cuenta_cobro", extrae los campos del schema. Reglas:
   - Fechas SIEMPRE en formato ISO YYYY-MM-DD.
   - El NIT no debe contener puntos. Incluye el dígito de verificación con guion si aparece (ej: 900123456-7).
   - Si un campo no es legible o no aparece, déjalo en null en vez de inventar.
   - "items" puede ser una lista vacía si no se distinguen líneas.

   📄 ESPECÍFICO DE LA CUENTA DE COBRO:
   - "vendor_name" es la persona que cobra (quien firma), NO la empresa a la que se le cobra.
   - "vendor_nit" es la CÉDULA de esa persona, sin puntos. Es su identificación válida: trátala igual que un NIT.
   - "iva" normalmente es null: una persona natural no responsable de IVA no lo discrimina. No lo calcules tú.
   - "invoice_number" suele ser null. "cufe" SIEMPRE null: las cuentas de cobro no son documentos electrónicos.
   - "total" es el valor que se cobra. "items" puede describir el servicio prestado en una sola línea.

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

   📌 REGLAS PARA EL CUFE / CUDE (facturación electrónica DIAN):
   - Las facturas electrónicas colombianas traen impreso un CUFE (Código Único de Factura Electrónica). Los documentos equivalentes, notas crédito/débito y documentos soporte traen un CUDE. Ambos van en el campo "cufe".
   - Búscalo junto a etiquetas como "CUFE", "CUFE:", "CUDE", "Código único de factura electrónica", "CUFE/CUDE", normalmente cerca del código QR o al pie del documento.
   - Son 96 caracteres HEXADECIMALES (solo 0-9 y a-f), sin espacios ni guiones. Transcríbelo COMPLETO, carácter por carácter, en minúsculas.
   - Suele venir partido en 2 o 3 líneas: únelo en una sola cadena continua, sin espacios ni saltos de línea.
   - No lo confundas con el número de factura, el NIT, el número de autorización, ni con el texto del QR.
   - Si el documento NO trae CUFE/CUDE impreso (tirilla POS simple, recibo manual, cuenta de cobro), devuelve null. NUNCA lo inventes ni lo completes con caracteres al azar.
   - Si lo ves pero está parcialmente ilegible, transcribe lo que sí puedas leer y déjalo anotado en "notes".

3. Clasifica el gasto en expense_category según el contenido:
   - "combustible" → gasolina, ACPM, gas vehicular.
   - "transporte" → taxis, plataformas de transporte, fletes.
   - "peajes" → peajes de carreteras.
   - "parqueaderos" → estacionamientos, parqueaderos.
   - "materiales" → materiales de construcción, ferretería, insumos de obra.
   - "consumibles" → papelería, aseo, útiles de oficina.
   - "alimentacion" → restaurantes, cafeterías, bebidas, alimentos.
   - "otro" → cualquier gasto que no encaje en las anteriores.
   En un "soporte" no hay gasto: usa "otro".
4. Calibra confidence_score honestamente:
   - Si falta la identificación del proveedor (vendor_nit es null, sea NIT o cédula), el confidence_score
     NUNCA puede superar 0.10. Identificar a quién se le pagó es primordial.
   - >= 0.85 → todos los campos clave legibles y consistentes (subtotal + iva ≈ total), identificación presente.
   - 0.6 – 0.85 → algunos campos dudosos o falta uno secundario, identificación presente.
   - < 0.6 → documento parcial, borroso, o con campos clave ilegibles.
   - En un "soporte", el score mide qué tan seguro estás de la clasificación, no de la extracción.
     No lo bajes por no haber encontrado importes: un soporte no los tiene.

Responde SOLO con el JSON estructurado.`;
