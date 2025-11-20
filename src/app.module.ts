import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PuppeteerService } from './puppeteer/puppeteer.service';
import { MessagesGateway } from './gateway/gateway.gateway';
import { AdminController } from './controllers/admin.controller';

@Module({
  imports: [],
  controllers: [AppController, AdminController],
  providers: [AppService, PuppeteerService, MessagesGateway],
})
export class AppModule {}
