import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { PettyCashModule } from './modules/petty-cash/petty-cash.module';
import { WorkersModule } from './modules/workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    AuthModule,
    WorkersModule,
    PettyCashModule,
    ExtractionModule,
  ],
})
export class AppModule {}
