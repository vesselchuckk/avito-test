import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { gracefulShutdown } from './helpers/shutdown';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors
  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`app is running on: ${await app.getUrl()}`);
  
  const puppeteerService = app.get('PuppeteerService', { strict: false });

  gracefulShutdown(puppeteerService);
}
bootstrap();
