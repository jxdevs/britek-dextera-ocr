import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000, { message: 'El monto inicial no puede superar $1.000.000' })
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
}
