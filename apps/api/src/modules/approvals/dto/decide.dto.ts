import { Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export type ApprovalAction = 'approve' | 'reject';

export class DecideDto {
  @IsUUID('4')
  invoice_id!: string;

  @IsIn(['approve', 'reject'])
  action!: ApprovalAction;

  @ValidateIf((o) => o.action === 'approve')
  @IsUUID('4')
  box_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  edited_fields?: Record<string, unknown>;
}
