import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import * as models from './models';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('db.host');
        const isRemote = host !== 'localhost' && host !== '127.0.0.1';

        return {
          dialect: 'postgres',
          host,
          port: config.get<number>('db.port'),
          username: config.get<string>('db.user'),
          password: config.get<string>('db.password'),
          database: config.get<string>('db.name'),
          models: Object.values(models),
          autoLoadModels: true,
          synchronize: config.get<boolean>('db.sync') ?? false,
          logging: false,
          ...(isRemote && {
            dialectOptions: {
              ssl: {
                require: true,
                rejectUnauthorized: false,
              },
            },
          }),
          define: {
            underscored: true,
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
