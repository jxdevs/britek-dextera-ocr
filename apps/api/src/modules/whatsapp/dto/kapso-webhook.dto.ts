import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Payload genérico de un mensaje entrante desde Kapso. La forma real
 * dependerá del agente que configures; cuando tengas los docs, mapea
 * la respuesta de Kapso a este shape antes de enviarla a este endpoint
 * (o ajusta los nombres aquí).
 */
export class KapsoWebhookDto {
  @IsString()
  @MaxLength(128)
  message_id!: string;

  @IsString()
  @Matches(/^\+?\d{8,15}$/, {
    message: 'from debe ser un teléfono internacional, opcionalmente con +',
  })
  from!: string;

  @IsIn(['text', 'image'])
  type!: 'text' | 'image';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  /** URL desde la que descargar la media. Usar esto en producción. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  media_url?: string;

  /** Imagen embebida en base64. Útil para tests locales sin URL accesible. */
  @IsOptional()
  @IsString()
  media_base64?: string;

  @IsOptional()
  @IsString()
  media_mime_type?: string;

  @IsOptional()
  timestamp?: string | number;
}
