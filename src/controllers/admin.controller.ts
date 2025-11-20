import { Controller, Logger, Post } from '@nestjs/common';
import { PuppeteerService } from 'src/puppeteer/puppeteer.service';

@Controller('admin')
export class AdminController {
	private logger = new Logger('AdminController');
	
	constructor(private readonly puppeteer: PuppeteerService) {	}

	@Post('start')
	async start() {
		await this.puppeteer.start();
		return { status: 'puppeteer monitoring started' };
		return { ok: true }
	}
	@Post('stop')
	async stop() {
		await this.puppeteer.stop();
		return { status: 'puppeteer monitoring stopped' };
		return { ok: true }	
	}
}
