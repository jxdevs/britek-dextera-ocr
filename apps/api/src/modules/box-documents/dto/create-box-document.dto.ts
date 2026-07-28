import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const TYPES = ['rut', 'cedula', 'camara_comercio', 'certificacion_bancaria', 'otro'];

export class CreateBoxDocumentDto {
  @IsOptional()
  @IsIn(TYPES, { message: `doc_type debe ser uno de: ${TYPES.join(', ')}` })
  doc_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** Residente al que pertenece el soporte. Opcional: un RUT es del proveedor. */
  @IsOptional()
  @IsUUID('4')
  worker_id?: string;
}
