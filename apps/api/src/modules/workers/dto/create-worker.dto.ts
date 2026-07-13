import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { WorkerRole } from '../../../database/models/worker.model';

/**
 * Normaliza el teléfono al formato que usa el matching de WhatsApp
 * (+57XXXXXXXXXX): quita espacios/guiones/paréntesis y agrega el
 * indicativo cuando viene como "57..." o como celular de 10 dígitos.
 */
function normalizeColombianPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const cleaned = value.replace(/[\s\-().]/g, '');
  if (/^573\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^3\d{9}$/.test(cleaned)) return `+57${cleaned}`;
  return cleaned;
}

export class CreateWorkerDto {
  @IsString()
  @MinLength(3)
  document_number!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @Transform(({ value }) => normalizeColombianPhone(value))
  @IsString()
  @Matches(/^\+573\d{9}$/, {
    message:
      'El teléfono debe ser un celular colombiano con indicativo +57 (ej: +573001234567)',
  })
  phone!: string;

  @ValidateIf((o) => o.email !== null && o.email !== undefined)
  @IsOptional()
  @IsEmail()
  email?: string | null;




  @IsOptional()
  @IsIn(['worker', 'approver', 'admin'])
  role?: WorkerRole;
}
