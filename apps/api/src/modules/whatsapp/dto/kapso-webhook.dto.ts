import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Sub-DTO para interactive.button_reply que viene en el webhook
 * cuando el usuario presiona un botón interactivo.
 */
export class ButtonReplyDto {
  @IsString()
  id!: string;

  @IsString()
  title!: string;
}

/**
 * Sub-DTO para el campo interactive del webhook.
 */
export class InteractiveDto {
  @IsIn(['button_reply', 'list_reply'])
  type!: 'button_reply' | 'list_reply';

  @IsOptional()
  @ValidateNested()
  @Type(() => ButtonReplyDto)
  button_reply?: ButtonReplyDto;
}

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

  @IsIn(['text', 'image', 'interactive'])
  type!: 'text' | 'image' | 'interactive';

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

  /** Datos de interactive (button_reply o list_reply) */
  @IsOptional()
  @ValidateNested()
  @Type(() => InteractiveDto)
  interactive?: InteractiveDto;

  @IsOptional()
  timestamp?: string | number;
}
