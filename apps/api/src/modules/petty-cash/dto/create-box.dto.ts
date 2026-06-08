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
  // Nota: el tope de $1.000.000 se valida en el service con lógica de excepciones
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

  /** Requerido cuando initial_amount > $1.000.000 */
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'La justificación de excepción debe tener al menos 10 caracteres' })
  exception_justification?: string;
}
