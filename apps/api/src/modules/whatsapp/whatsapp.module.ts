import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PettyCashBox, WhatsappEvent, Worker } from '../../database/models';
import { InvoicesModule } from '../invoices/invoices.module';
import { KapsoService } from './kapso.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [
    SequelizeModule.forFeature([WhatsappEvent, Worker, PettyCashBox]),
    InvoicesModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, KapsoService],
})
export class WhatsappModule {}
