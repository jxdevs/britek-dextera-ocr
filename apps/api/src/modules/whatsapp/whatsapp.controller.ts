import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KapsoWebhookDto } from './dto/kapso-webhook.dto';
import { KapsoSignatureGuard } from './guards/kapso-signature.guard';
import { WhatsappService } from './whatsapp.service';

@Controller()
export class WhatsappController {
  constructor(private readonly service: WhatsappService) {}

  @Post('webhooks/kapso')
  @UseGuards(KapsoSignatureGuard)
  @HttpCode(200)
  receive(@Body() dto: KapsoWebhookDto) {
    return this.service.handleIncoming(dto);
  }

  @Get('whatsapp-events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  list(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Math.max(parseInt(limit, 10), 1), 500) : 50;
    return this.service.list(n);
  }
}
