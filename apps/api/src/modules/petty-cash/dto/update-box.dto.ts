import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateBoxDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  initial_amount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  current_balance?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  project_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cost_center?: string;

  /** Requerido cuando initial_amount > $1.000.000 */
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'La justificación de excepción debe tener al menos 10 caracteres' })
  exception_justification?: string;
}
