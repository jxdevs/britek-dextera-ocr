import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ExtractionController } from './extraction.controller';

@Module({
  imports: [AiModule],
  controllers: [ExtractionController],
})
export class ExtractionModule {}
