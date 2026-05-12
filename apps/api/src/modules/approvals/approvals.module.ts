import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Approval,
  BoxAssignment,
  Invoice,
  PettyCashBox,
} from '../../database/models';
import { InvoicesModule } from '../invoices/invoices.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Invoice, PettyCashBox, BoxAssignment, Approval]),
    InvoicesModule,
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
