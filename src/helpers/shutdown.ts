import { PuppeteerService } from "src/puppeteer/puppeteer.service";
import { Logger } from "@nestjs/common";

export function gracefulShutdown(puppeteerService: PuppeteerService) { 
	const logger = new Logger('shutdown');
	const shutdown = async (signal: string) => { 
		logger.log(`received ${signal}. shutting down...`);
		try {
			await puppeteerService.stop();
		} catch (error) {
			logger.error('error during shutdown', error);
		} finally {
			process.exit(0);
		}
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}