import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';

@Injectable()
export class KapsoSignatureGuard implements CanActivate {
  private readonly logger = new Logger(KapsoSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('kapso.webhookSecret');
    if (!secret) {
      this.logger.warn('KAPSO_WEBHOOK_SECRET vacío — saltando validación de firma.');
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const header = (req.headers['x-kapso-signature'] as string | undefined) ?? '';
    const provided = header.replace(/^sha256=/i, '').trim();
    if (!provided) throw new UnauthorizedException('Falta header X-Kapso-Signature');
    if (!req.rawBody) throw new UnauthorizedException('No se pudo capturar el cuerpo crudo');

    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Firma Kapso inválida');
    }
    return true;
  }
}
