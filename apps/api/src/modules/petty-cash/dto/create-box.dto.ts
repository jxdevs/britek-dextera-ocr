import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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
  initial_amount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  worker_ids!: string[];

  @IsOptional()
  @IsUUID('4')
  primary_worker_id?: string;
}
