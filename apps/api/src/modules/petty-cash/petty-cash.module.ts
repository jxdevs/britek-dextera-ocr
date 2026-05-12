import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  Approval,
  BoxAssignment,
  Invoice,
  PettyCashBox,
  Worker,
} from '../../database/models';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';

@Module({
  imports: [
    SequelizeModule.forFeature([PettyCashBox, BoxAssignment, Worker, Invoice, Approval]),
  ],
  controllers: [PettyCashController],
  providers: [PettyCashService],
  exports: [PettyCashService],
})
export class PettyCashModule {}
