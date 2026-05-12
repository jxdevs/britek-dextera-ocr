import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Worker } from '../../database/models';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Module({
  imports: [SequelizeModule.forFeature([Worker])],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
