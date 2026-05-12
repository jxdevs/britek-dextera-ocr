import { IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID('4')
  worker_id!: string;
}
