import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Approval,
  BoxAssignment,
  Invoice,
  PettyCashBox,
  Worker,
} from '../../database/models';
import { AiModule } from '../ai/ai.module';
import { BoxDocumentsModule } from '../box-documents/box-documents.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Invoice, Worker, PettyCashBox, BoxAssignment, Approval]),
    AiModule,
    BoxDocumentsModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
