import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
