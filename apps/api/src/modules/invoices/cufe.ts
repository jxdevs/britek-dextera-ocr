/**
 * CUFE (Código Único de Factura Electrónica) y CUDE (su equivalente en documentos
 * equivalentes, notas crédito/débito y documento soporte). Ambos son un hash
 * SHA-384 impreso en hexadecimal: 96 caracteres de 0-9 y a-f.
 *
 * Se guardan en la misma columna `invoices.cufe`, porque para efectos de la
 * validación ante la DIAN se consultan igual.
 */
export const CUFE_PATTERN = /^[0-9a-f]{96}$/;

/**
 * Normaliza un CUFE/CUDE leído por OCR o tecleado por un aprobador: le quita la
 * etiqueta ("CUFE:"), los espacios y saltos de línea con los que suele venir
 * partido en el documento, y lo pasa a minúsculas.
 *
 * Devuelve la cadena aunque no tenga los 96 caracteres: una lectura parcial es
 * información útil para revisar contra la imagen, y descartarla perdería el dato.
 */
export function normalizeCufe(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/^\s*(cufe|cude)\s*[:=-]?\s*/i, '')
    .replace(/[\s -]/g, '')
    .toLowerCase();
  return cleaned === '' ? null : cleaned.slice(0, 100);
}

/** true si el código tiene la forma exacta que exige la DIAN (96 hex). */
export function isValidCufeFormat(value: string | null | undefined): boolean {
  return !!value && CUFE_PATTERN.test(value);
}

/**
 * URL del portal público de la DIAN para verificar un documento electrónico.
 * Es la misma que abre el QR impreso en la factura.
 */
export function dianValidationUrl(cufe: string): string {
  return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;
}
