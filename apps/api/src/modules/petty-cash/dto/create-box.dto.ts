import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { BoxType } from '../../../database/models/petty-cash-box.model';

export class CreateBoxDto {
  @IsString()
  @MinLength(3)
  code!: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsIn(['individual', 'shared'])
  type!: BoxType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000, { message: 'El monto inicial no puede superar $1.000.000' })
  initial_amount!: number;

  @IsString()
  @MinLength(1)
  project_name!: string;

  @IsString()
  @MinLength(1)
  cost_center!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  worker_ids!: string[];

  @IsOptional()
  @IsUUID('4')
  primary_worker_id?: string;
}
