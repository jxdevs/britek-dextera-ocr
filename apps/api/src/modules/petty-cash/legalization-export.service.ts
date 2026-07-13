import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as ExcelJS from 'exceljs';
import { Invoice, PettyCashBox, Worker } from '../../database/models';

/** Colores corporativos del formato Britek */
const TEAL = 'FF12666C';
const WHITE = 'FFFFFFFF';

/** Mínimo de filas de detalle para conservar la apariencia del formato */
const MIN_DETAIL_ROWS = 9;

const CATEGORY_LABELS: Record<string, string> = {
  combustible: 'Combustible',
  transporte: 'Transporte',
  peajes: 'Peajes',
  parqueaderos: 'Parqueaderos',
  materiales: 'Materiales',
  consumibles: 'Consumibles',
  alimentacion: 'Alimentación',
  otro: 'Otro',
};

const MONEY_FMT = '"$"#,##0';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function tealCell(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = thinBorder;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toNumber(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

@Injectable()
export class LegalizationExportService {
  constructor(
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
  ) {}

  /**
   * Genera el formato "Relación de Legalización Viáticos" de Britek para una
   * caja menor, con una fila por factura legalizada (aprobada).
   */
  async buildWorkbook(boxId: string): Promise<{ buffer: Buffer; filename: string }> {
    const box = await this.boxes.findByPk(boxId, {
      include: [
        {
          model: Worker,
          attributes: ['id', 'name', 'document_number'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });
    if (!box) throw new NotFoundException('Caja no encontrada');

    const invoices = await this.invoices.findAll({
      where: { box_id: boxId, status: 'approved' },
      attributes: [
        'id', 'vendor_nit', 'vendor_name', 'invoice_number', 'invoice_date',
        'subtotal', 'iva', 'total', 'expense_category', 'submitted_at',
      ],
      order: [['invoice_date', 'ASC'], ['submitted_at', 'ASC']],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OCRDEMO';
    const ws = workbook.addWorksheet('Legalización', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    ws.columns = [
      { width: 12 }, // A CODIGO PROYECTO
      { width: 18 }, // B C.C. O NIT
      { width: 30 }, // C NOMBRE
      { width: 34 }, // D CONCEPTO
      { width: 14 }, // E VALOR
      { width: 12 }, // F IVA
      { width: 14 }, // G TOTAL
      { width: 12 }, // H FECHA
    ];

    // ── Encabezado ────────────────────────────────────────────────────────
    ws.mergeCells('A1:B2');
    const logo = ws.getCell('A1');
    logo.value = 'BRITEK';
    logo.font = { bold: true, size: 20, color: { argb: TEAL } };
    logo.alignment = { vertical: 'middle', horizontal: 'center' };
    logo.border = thinBorder;

    ws.mergeCells('C1:H1');
    const formato = ws.getCell('C1');
    formato.value = 'FORMATO';
    formato.font = { bold: true, size: 11 };
    formato.alignment = { vertical: 'middle', horizontal: 'center' };
    formato.border = thinBorder;

    ws.mergeCells('C2:H2');
    tealCell(ws.getCell('C2'), 'RELACIÓN DE LEGALIZACIÓN VIATICOS');
    ws.getRow(2).height = 24;

    // ── Datos generales ───────────────────────────────────────────────────
    const legalizationDate = box.closed_at ?? new Date();

    ws.mergeCells('A3:B3');
    ws.getCell('A3').value = 'FECHA DE LA LEGALIZACIÓN:';
    ws.getCell('A3').font = { bold: true, size: 10 };
    ws.getCell('C3').value = formatDate(legalizationDate);

    ws.mergeCells('D3:E3');
    ws.getCell('D3').value = 'FECHA DE SOLICITUD DEL ANTICIPO:';
    ws.getCell('D3').font = { bold: true, size: 10 };
    ws.getCell('F3').value = formatDate(box.opened_at);

    ws.getCell('G3').value = 'CONSECUTIVO No.';
    ws.getCell('G3').font = { bold: true, size: 10 };
    ws.getCell('H3').value = box.code;

    ws.mergeCells('A4:B4');
    ws.getCell('A4').value = 'NOMBRE PROYECTO:';
    ws.getCell('A4').font = { bold: true, size: 10 };
    ws.mergeCells('C4:E4');
    ws.getCell('C4').value = box.project_name ?? box.name;

    ws.getCell('F4').value = 'EMPRESA:';
    ws.getCell('F4').font = { bold: true, size: 10 };
    ws.mergeCells('G4:H4');
    ws.getCell('G4').value = 'BRITEK SAS';
    ws.getCell('G4').alignment = { horizontal: 'center' };

    for (const row of [3, 4]) {
      for (let col = 1; col <= 8; col++) {
        ws.getRow(row).getCell(col).border = thinBorder;
      }
    }

    // ── Tabla de detalle ──────────────────────────────────────────────────
    const HEADERS = ['CODIGO PROYECTO', 'C.C. O NIT', 'NOMBRE', 'CONCEPTO', 'VALOR', 'IVA', 'TOTAL', 'FECHA'];
    const headerRow = ws.getRow(5);
    HEADERS.forEach((title, i) => tealCell(headerRow.getCell(i + 1), title));
    headerRow.height = 26;

    let totalValor = 0;
    let totalIva = 0;
    let totalTotal = 0;
    const detailRows = Math.max(invoices.length, MIN_DETAIL_ROWS);
    const firstDetail = 6;

    for (let i = 0; i < detailRows; i++) {
      const row = ws.getRow(firstDetail + i);
      const inv = invoices[i];
      if (inv) {
        const iva = toNumber(inv.iva);
        const total = toNumber(inv.total);
        const valor = inv.subtotal != null ? toNumber(inv.subtotal) : total - iva;
        totalValor += valor;
        totalIva += iva;
        totalTotal += total;

        row.getCell(1).value = box.cost_center ?? box.code;
        row.getCell(2).value = inv.vendor_nit ?? '';
        row.getCell(3).value = inv.vendor_name ?? '';
        const category = inv.expense_category ? CATEGORY_LABELS[inv.expense_category] ?? inv.expense_category : 'Gasto';
        row.getCell(4).value = inv.invoice_number ? `${category} - Factura ${inv.invoice_number}` : category;
        row.getCell(5).value = valor;
        row.getCell(6).value = iva;
        row.getCell(7).value = total;
        row.getCell(8).value = formatDate(inv.invoice_date ?? inv.submitted_at);
      }
      row.height = 20;
      for (let col = 1; col <= 8; col++) {
        const cell = row.getCell(col);
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', horizontal: col >= 5 && col <= 7 ? 'right' : 'left', wrapText: true };
        if (col >= 5 && col <= 7) cell.numFmt = MONEY_FMT;
        if (col === 8) cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    }

    // ── Fila de totales ───────────────────────────────────────────────────
    const totalsRowIdx = firstDetail + detailRows;
    const totalsRow = ws.getRow(totalsRowIdx);
    ws.mergeCells(`A${totalsRowIdx}:D${totalsRowIdx}`);
    totalsRow.getCell(1).value = 'TOTALES';
    totalsRow.getCell(1).font = { bold: true, size: 10 };
    totalsRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    totalsRow.getCell(5).value = totalValor;
    totalsRow.getCell(6).value = totalIva;
    totalsRow.getCell(7).value = totalTotal;
    for (let col = 1; col <= 8; col++) {
      const cell = totalsRow.getCell(col);
      cell.border = thinBorder;
      if (col >= 5 && col <= 7) {
        cell.numFmt = MONEY_FMT;
        cell.font = { bold: true, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    }
    totalsRow.height = 20;

    // ── Resumen (anticipo / sobrante / legalización / reembolso) ─────────
    const anticipo = toNumber(box.initial_amount);
    const legalizacion = totalTotal;
    const sobrante = Math.max(anticipo - legalizacion, 0);
    const reembolso = Math.max(legalizacion - anticipo, 0);

    const summary: Array<[string, number]> = [
      ['VALOR ANTICIPO', anticipo],
      ['SOBRANTE DE EFECTIVO', sobrante],
      ['VALOR LEGALIZACION', legalizacion],
      ['VALOR REEMBOLSO', reembolso],
    ];

    const summaryStart = totalsRowIdx + 1;
    // Caja grande a la izquierda para observaciones/firma
    ws.mergeCells(`A${summaryStart}:F${summaryStart + 3}`);
    ws.getCell(`A${summaryStart}`).border = thinBorder;

    summary.forEach(([label, value], i) => {
      const row = ws.getRow(summaryStart + i);
      row.getCell(7).value = label;
      row.getCell(7).font = { bold: true, size: 9 };
      row.getCell(7).alignment = { vertical: 'middle', wrapText: true };
      row.getCell(7).border = thinBorder;
      row.getCell(8).value = value;
      row.getCell(8).numFmt = MONEY_FMT;
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(8).border = thinBorder;
      row.height = 20;
    });

    // ── Responsable ───────────────────────────────────────────────────────
    const workers = box.workers ?? [];
    const primary =
      workers.find((w) => (w as Worker & { BoxAssignment?: { is_primary: boolean } }).BoxAssignment?.is_primary) ??
      workers[0];
    const responsible = primary
      ? `${primary.name} — C.C. ${primary.document_number}`
      : '';

    const signRowIdx = summaryStart + 4;
    const signRow = ws.getRow(signRowIdx);
    ws.mergeCells(`A${signRowIdx}:B${signRowIdx}`);
    tealCell(signRow.getCell(1), 'NOMBRE Y CEDULA DEL RESPONSABLE QUIEN SOLICITA EL ANTICIPO');
    signRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    ws.mergeCells(`C${signRowIdx}:H${signRowIdx}`);
    signRow.getCell(3).value = responsible ? `Firma y Nombre: ${responsible}` : 'Firma y Nombre';
    signRow.getCell(3).font = { bold: true, size: 10 };
    signRow.getCell(3).alignment = { vertical: 'middle', wrapText: true };
    signRow.getCell(3).border = thinBorder;
    signRow.height = 34;

    // ── Nota ──────────────────────────────────────────────────────────────
    const noteRowIdx = signRowIdx + 1;
    ws.mergeCells(`A${noteRowIdx}:H${noteRowIdx}`);
    const note = ws.getCell(`A${noteRowIdx}`);
    note.value =
      'Este anticipo, debe ser legalizado máximo a los cinco (5) días hábiles, una vez generado el pago del anticipo. Adjuntando los soportes correspondientes.';
    note.font = { italic: true, size: 9 };
    note.alignment = { vertical: 'middle', wrapText: true };
    note.border = thinBorder;
    ws.getRow(noteRowIdx).height = 22;

    // ── Pie: revisado / aprobado / contabilizado ──────────────────────────
    const footerRowIdx = noteRowIdx + 1;
    const footer = ws.getRow(footerRowIdx);
    tealCell(footer.getCell(1), 'REVISADO:');
    ws.mergeCells(`B${footerRowIdx}:C${footerRowIdx}`);
    footer.getCell(2).border = thinBorder;
    tealCell(footer.getCell(4), 'APROBADO:');
    ws.mergeCells(`E${footerRowIdx}:F${footerRowIdx}`);
    footer.getCell(5).border = thinBorder;
    tealCell(footer.getCell(7), 'CONTABILIZADO');
    footer.getCell(8).border = thinBorder;
    footer.height = 24;

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `legalizacion-${box.code}.xlsx`;
    return { buffer, filename };
  }
}
