import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BoxDocument, Invoice, PettyCashBox, Worker } from '../../database/models';
import { BoxDocumentsController } from './box-documents.controller';
import { BoxDocumentsService } from './box-documents.service';

@Module({
  imports: [SequelizeModule.forFeature([BoxDocument, Invoice, PettyCashBox, Worker])],
  controllers: [BoxDocumentsController],
  providers: [BoxDocumentsService],
  exports: [BoxDocumentsService],
})
export class BoxDocumentsModule {}
