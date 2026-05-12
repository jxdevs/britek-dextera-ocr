import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import type { WorkerRole } from '../../../database/models/worker.model';

export class CreateWorkerDto {
  @IsString()
  @MinLength(3)
  document_number!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^\+?\d{8,15}$/, {
    message: 'phone debe ser sólo dígitos, opcionalmente con + al inicio',
  })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(['worker', 'approver', 'admin'])
  role?: WorkerRole;
}
