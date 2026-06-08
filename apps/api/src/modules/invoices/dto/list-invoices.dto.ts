import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { InvoiceStatus } from '../../../database/models/invoice.model';

export class ListInvoicesDto {
  @IsOptional()
  @IsIn(['pending', 'observed', 'approved', 'rejected'])
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID('4')
  worker_id?: string;

  @IsOptional()
  @IsUUID('4')
  box_id?: string;
}
