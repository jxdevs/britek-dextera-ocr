import { IsUUID } from 'class-validator';

/** Cuelga un soporte ya guardado de un gasto (típicamente una cuenta de cobro). */
export class AttachDocumentDto {
  @IsUUID('4')
  invoice_id!: string;
}
