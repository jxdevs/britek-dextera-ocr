import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PettyCashModule } from './modules/petty-cash/petty-cash.module';
import { StorageModule } from './modules/storage/storage.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { WorkersModule } from './modules/workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    AuditModule,
    StorageModule,
    AuthModule,
    WorkersModule,
    PettyCashModule,
    InvoicesModule,
    ApprovalsModule,
    WhatsappModule,
    ExtractionModule,
    DashboardModule,
  ],
})
export class AppModule {}
