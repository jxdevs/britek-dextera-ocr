import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import {
  BoxAssignment,
  PettyCashBox,
  Worker,
} from './database/models';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const logger = new Logger('Seed');
  const sequelize = app.get(Sequelize);

  try {
    logger.log('Recreating schema (sync force) ...');
    await sequelize.sync({ force: true });

    await sequelize.transaction(async (t) => {
      const adminHash = await bcrypt.hash('admin123', 10);
      const approverHash = await bcrypt.hash('approver123', 10);

      const [admin, , ana, juan, sofia] = await Worker.bulkCreate(
        [
          {
            document_number: '111111',
            name: 'Admin OCRDEMO',
            email: 'admin@ocrdemo.local',
            phone: '+573000000001',
            role: 'admin',
            password_hash: adminHash,
          },
          {
            document_number: '222222',
            name: 'Carlos Aprobador',
            email: 'aprobador@ocrdemo.local',
            phone: '+573000000002',
            role: 'approver',
            password_hash: approverHash,
          },
          {
            document_number: '333333',
            name: 'Ana Trabajadora',
            email: null,
            phone: '+573000000003',
            role: 'worker',
            password_hash: null,
          },
          {
            document_number: '444444',
            name: 'Juan Trabajador',
            email: null,
            phone: '+573000000004',
            role: 'worker',
            password_hash: null,
          },
          {
            document_number: '555555',
            name: 'Sofía Trabajadora',
            email: null,
            phone: '+573000000005',
            role: 'worker',
            password_hash: null,
          },
        ],
        { transaction: t, returning: true },
      );

      const individual = await PettyCashBox.create(
        {
          code: 'CAJA-IND-001',
          name: 'Anticipo viaje Ana — mayo 2026',
          type: 'individual',
          initial_amount: '1000000',
          current_balance: '1000000',
          opened_at: new Date(),
          status: 'open',
          created_by: admin.id,
        },
        { transaction: t },
      );

      const shared = await PettyCashBox.create(
        {
          code: 'CAJA-SHR-001',
          name: 'Caja oficina principal',
          type: 'shared',
          initial_amount: '2000000',
          current_balance: '2000000',
          opened_at: new Date(),
          status: 'open',
          created_by: admin.id,
        },
        { transaction: t },
      );

      await BoxAssignment.bulkCreate(
        [
          { box_id: individual.id, worker_id: ana.id, is_primary: true },
          { box_id: shared.id, worker_id: ana.id, is_primary: false },
          { box_id: shared.id, worker_id: juan.id, is_primary: false },
          { box_id: shared.id, worker_id: sofia.id, is_primary: false },
        ],
        { transaction: t },
      );

      logger.log('Seed completed.');
      logger.log('---------------------------------------');
      logger.log('Admin       admin@ocrdemo.local / admin123');
      logger.log('Approver    aprobador@ocrdemo.local / approver123');
      logger.log(`Workers     Ana ${ana.phone}, Juan ${juan.phone}, Sofía ${sofia.phone}`);
      logger.log(`Individual  ${individual.code} ($${individual.current_balance})`);
      logger.log(`Shared      ${shared.code} ($${shared.current_balance})`);
      logger.log('---------------------------------------');
    });
  } catch (err) {
    logger.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

seed();
