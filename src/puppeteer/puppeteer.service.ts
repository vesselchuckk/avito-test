import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { MonitoredMessage } from './types/puppeteer.types';
import { MessagesGateway } from '../gateway/gateway.gateway';

@Injectable()
export class PuppeteerService implements OnModuleDestroy {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private logger = new Logger('PuppeteerService');

	// state 
	private monitoring = false;
	private monitorInterval = (process.env.MONITOR_INTERVAL || 5000) as number;
	private seenMsgID = new Set<string>();

	constructor(private readonly gateway: MessagesGateway) {}

	async start() {
		if (this.monitoring) return;
		this.monitoring = true;

		try {
			this.logger.log('puppeteer service started');
			await this.launchBrowser();

			await this.login();
			await this.openMsgPage();

			await this.monitorMessages();
		}
		catch (error) {
			this.logger.error('error in puppeteer service', error);
			this.monitoring = false;
		}
	}

	async stop() {
		this.monitoring = false;
		this.logger.log('puppeteer service stopped');
		await this.closeBrowser();
	}

	async launchBrowser() {
    if (this.browser) return;

    this.logger.log('Launching browser...');
    
		this.browser = await puppeteer.launch({
      headless: process.env.HEADLESS !== 'false', // default: headless
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
		this.page = await this.browser.newPage();

    await this.page.setViewport({ width: 1200, height: 900 });
    this.page.setDefaultNavigationTimeout(30000);
  }

	private async login() {
		if (!this.page) throw new Error('Page not initialized');

		const messagesUrl = 'https://www.avito.ru/profile';
		this.logger.log(`Checking login by opening ${messagesUrl}`);
		await this.page.goto(messagesUrl, { waitUntil: 'networkidle2' });


		const loggedIn = await this.page.evaluate(() => {
			const loginButton = document.querySelector('a[href*="/login"]') || document.querySelector('button[data-marker="login-button"]');
			return !loginButton;
		});
		
		if (!loggedIn) {
			this.logger.log('Not logged in — performing login flow');
			await this.performLogin();
		} else {
			this.logger.log('Already logged in (session present)');
		}
  }


	private async performLogin() {
		if (!this.page) throw new Error('Page not initialized');
		const loginUrl = 'https://www.avito.ru/profile';
		await this.page.goto(loginUrl, { waitUntil: 'networkidle2' });

		try {
			// try to click login link/button if present
			const loginTrigger = await this.page.$('a[href*="/login"], button[data-marker="login-button"]');
			if (loginTrigger) await loginTrigger.click();

			// wait for login form
			await new Promise((res) => setTimeout(res, 1000)); // wait a bit

			// try to fill credentials
			const login = process.env.AVITO_LOGIN;
			const password = process.env.AVITO_PASSWORD;
			if (!login || !password) {
				throw new Error('AVITO_LOGIN or AVITO_PASSWORD environment variables are not set');
			}

			// cred input
			const loginSelector = 'input[name="login"]';
			const passwordSelector = 'input[name="password"]';
			// fallback selectors
			const altLoginSelector = 'input[type="text"]';
			const altPasswordSelector = 'input[type="password"]';

			const ls = (await this.page.$(loginSelector)) ? loginSelector : altLoginSelector;
			const ps = (await this.page.$(passwordSelector)) ? passwordSelector : altPasswordSelector;

			await this.page.waitForSelector(ls, { timeout: 8000 });
			await this.page.type(ls, login, { delay: 50 });
			await this.page.type(ps, password, { delay: 50 });

			// submit
			const submitBtn = await this.page.$('button[type="submit"], button[data-marker="submit-button"]');
			if (submitBtn) {
				await Promise.all([this.page.waitForNavigation({ waitUntil: 'networkidle2' }), submitBtn.click()]);
			} else {
				// try press Enter
				await this.page.keyboard.press('Enter');
				await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
			}

			this.logger.log('Login flow complete — verifying login...');
			// quick check
			const stillNotLogged = await this.page.evaluate(() => {
				return !!(document.querySelector('a[href*="/login"]') || document.querySelector('button[data-marker="login-button"]'));
			});
			if (stillNotLogged) {
				throw new Error('Login appears to have failed — check credentials and selectors');
			}
			this.logger.log('Logged in successfully');
		} catch (err) {
			this.logger.error('Login failed', err as any);
			throw err;
		}
	}

	  private async openMsgPage() {
    if (!this.page) throw new Error('Page not initialized');
    
    const messagesUrl = 'https://www.avito.ru/profile/messages';
    await this.page.goto(messagesUrl, { waitUntil: 'networkidle2' });

    await new Promise((res) => setTimeout(res, 1000)); // wait a bit
    
		this.logger.log('Opened messages page');
  }

  private async monitorMessages() {
    if (!this.page) throw new Error('Page not initialized');
    this.logger.log('Starting poll loop for new messages');
    while (this.monitoring) {
      try {
        const newMessages = await this.scrapeNewMessages();
        for (const m of newMessages) {
          this.logger.log(`New message from ${m.from}: ${m.body.slice(0, 80)}`);
          this.gateway.sendMessage(m);
        }
      } catch (err) {
        this.logger.error('Error during scrape/poll', err as any);
        this.gateway.sendError(500, (err as any).message || String(err));
      }
      await new Promise((res) => setTimeout(res, this.monitorInterval));
    }
    this.logger.log('Exiting poll loop');
  }

	  private async scrapeNewMessages(): Promise<MonitoredMessage[]> {
    if (!this.page) throw new Error('Page not initialized');
    
    // try to find messages list items, their sender name, body, timestamp, and a message id.
    const targetName = process.env.AVITO_TARGET_NAME || 'Рушан';
    const res = await this.page.evaluate(
      (targetName) => {
        const out: Array<{ id: string; from: string; body: string; date: string }> = [];
        // conversation elements have data-item or items with [data-marker="item"]
        const convs = Array.from(document.querySelectorAll('[data-marker="seller-contacts-item"], [data-marker^="conversation-"], .conversation, .msg-list__item'));
        if (convs.length === 0) {
          // fallback: try to select message blocks
          const items = Array.from(document.querySelectorAll('div[role="listitem"], li'));
          for (const it of items) {
            const text = it.textContent || '';
            if (text.includes(targetName)) {
              out.push({
                id: (it.getAttribute('data-id') || it.id || String(Math.random())),
                from: targetName,
                body: text.trim(),
                date: new Date().toISOString()
              });
            }
          }
        } else {
          for (const c of convs) {
            const text = c.textContent || '';
            const id = c.getAttribute('data-id') || c.id || text.slice(0, 40);
            if (!text.includes(targetName)) continue;
            // extract last message snippet if possible
            const snippetEl = c.querySelector('.message-snippet, .msg-snippet, .item-snippet') || c.querySelector('p, span');
            const snippet = snippetEl ? snippetEl.textContent || '' : text.trim();
            out.push({ id, from: targetName, body: snippet.trim(), date: new Date().toISOString() });
          }
        }
        return out;
      },
      targetName
    );

    // filter out already seen
    const fresh: MonitoredMessage[] = [];
    for (const m of res) {
      const uniqueId = `${m.id}`;
      if (!this.seenMsgID.has(uniqueId)) {
        this.seenMsgID.add(uniqueId);
        fresh.push({ from: m.from, body: m.body, timestamp: m.date });
      }
    }
    return fresh;
  }

	async closeBrowser() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.logger.log('Browser closed');
    } catch (err) {
      this.logger.error('Error closing browser', err as any);
    }
  }

	async onModuleDestroy() {
		if (this.browser) {
			await this.browser.close();
		}
	}

}
