import puppeteer, { Browser, Page } from 'puppeteer-core';
import { parseBankSmsAlert, ParsedBankAlert } from '../parser/bank-sms-parser.js';
import { dispatchReconcileAlert } from '../reconciler/reconcile-client.js';

export interface MessagesObserverConfig {
  /** Chrome DevTools Protocol port (default: 9222) */
  cdpPort?: number;
  /** Host for CDP (default: '127.0.0.1') */
  cdpHost?: string;
  /** Shared secret for HMAC-SHA256 reconcile webhook */
  sharedSecret?: string;
  /** Billing Core base URL */
  billingCoreUrl?: string;
  /** Callback hook on detected alert */
  onAlertDetected?: (alert: ParsedBankAlert) => void;
}

export class GoogleMessagesObserver {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private processedUtrs = new Set<string>();
  private isRunning = false;

  constructor(private config: MessagesObserverConfig = {}) {}

  /**
   * Connects to Google Messages for Web via Chrome DevTools Protocol (CDP)
   */
  async start(): Promise<void> {
    const port = this.config.cdpPort || parseInt(process.env.GOOGLE_MESSAGES_CDP_PORT || '9222', 10);
    const host = this.config.cdpHost || '127.0.0.1';
    const browserUrl = `http://${host}:${port}`;

    console.log(`[CDP Listener] Connecting to Chrome via DevTools Protocol at ${browserUrl}...`);

    try {
      this.browser = await puppeteer.connect({
        browserURL: browserUrl,
        defaultViewport: null,
      });
    } catch (err) {
      console.error(`[CDP Listener] Could not connect to Chrome on ${browserUrl}.`);
      console.error(`[CDP Listener] Ensure Chrome is started with: chrome.exe --remote-debugging-port=${port} --user-data-dir="<path>"`);
      throw err;
    }

    console.log(`[CDP Listener] Successfully attached to Chrome via CDP.`);

    // Locate existing Google Messages tab or open a new one
    const pages = await this.browser.pages();
    this.page = pages.find(p => p.url().includes('messages.google.com')) || null;

    if (!this.page) {
      console.log(`[CDP Listener] No active Google Messages tab found. Opening https://messages.google.com/web...`);
      this.page = await this.browser.newPage();
      await this.page.goto('https://messages.google.com/web', { waitUntil: 'networkidle2' });
    } else {
      console.log(`[CDP Listener] Attached to existing Google Messages tab: ${this.page.url()}`);
    }

    this.isRunning = true;
    await this.setupRealtimeListeners();
  }

  /**
   * Injects DOM observer and Notification proxy into the Google Messages tab
   */
  private async setupRealtimeListeners(): Promise<void> {
    if (!this.page) return;

    // Expose Node.js bridge to the browser context
    await this.page.exposeFunction('__onOpenbillSmsAlert', async (sender: string, text: string) => {
      await this.handleIncomingMessage(sender, text);
    });

    // Inject hooks into page
    await this.page.evaluate(() => {
      console.log('[Openbill Injected] Initializing SMS listeners...');

      // 1. Intercept Web Notifications (triggers even if chat is not actively focused)
      const OriginalNotification = window.Notification;
      const CustomNotification = function(title: string, options?: NotificationOptions) {
        const bodyText = (options && options.body) ? options.body : '';
        // Bridge message to Node process
        // @ts-ignore
        if (window.__onOpenbillSmsAlert) {
          // @ts-ignore
          window.__onOpenbillSmsAlert(title || 'UNKNOWN', bodyText);
        }
        return new OriginalNotification(title, options);
      };
      CustomNotification.permission = OriginalNotification.permission;
      CustomNotification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
      // @ts-ignore
      window.Notification = CustomNotification;

      // 2. DOM MutationObserver on conversations list
      const observeConversations = () => {
        const container = document.querySelector('mws-conversations-list') 
          || document.querySelector('[role="list"]')
          || document.body;

        if (!container) {
          setTimeout(observeConversations, 2000);
          return;
        }

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node instanceof HTMLElement) {
                // Check if new message or unread conversation item
                const snippetEl = node.querySelector('.snippet-text') 
                  || node.querySelector('mws-text-message-part')
                  || node.querySelector('.text-msg-content');

                const nameEl = node.querySelector('.name-badge') 
                  || node.querySelector('.conversation-title')
                  || node.querySelector('h2');

                if (snippetEl && snippetEl.textContent) {
                  const text = snippetEl.textContent.trim();
                  const sender = nameEl?.textContent?.trim() || 'UNKNOWN';
                  // @ts-ignore
                  if (window.__onOpenbillSmsAlert) {
                    // @ts-ignore
                    window.__onOpenbillSmsAlert(sender, text);
                  }
                }
              }
            }
          }
        });

        observer.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        console.log('[Openbill Injected] DOM MutationObserver active on Google Messages');
      };

      observeConversations();
    });

    console.log(`[CDP Listener] Real-time SMS monitoring is active and listening for credit alerts.`);
  }

  /**
   * Processes incoming text message, extracts credit details, and triggers HMAC reconcile webhook
   */
  async handleIncomingMessage(sender: string, text: string): Promise<void> {
    if (!text || text.trim().length === 0) return;

    // Filter out non-credit SMS early
    if (!/\b(credited|received|deposited)\b/i.test(text)) {
      return;
    }

    console.log(`[CDP Listener] Candidate credit SMS received from '${sender}': "${text}"`);

    const parsed = parseBankSmsAlert(text, sender);
    if (!parsed) {
      console.log(`[CDP Listener] Message did not match bank credit formats or missing UTR.`);
      return;
    }

    // Deduplicate by UTR to prevent multiple processing of same alert
    if (this.processedUtrs.has(parsed.utr)) {
      console.log(`[CDP Listener] UTR ${parsed.utr} already processed, skipping.`);
      return;
    }

    this.processedUtrs.add(parsed.utr);
    console.log(`[CDP Listener] ✓ Validated ${parsed.bank} Credit Alert: ₹${parsed.amountDecimal} (${parsed.amountPaise} paise), UTR: ${parsed.utr}`);

    if (this.config.onAlertDetected) {
      this.config.onAlertDetected(parsed);
    }

    // Issue HMAC-SHA256 signed POST request to billing-core /api/reconcile
    await dispatchReconcileAlert(
      {
        amountPaise: parsed.amountPaise,
        utr: parsed.utr,
        sender: parsed.sender,
        rawMessage: parsed.rawText,
      },
      this.config.billingCoreUrl,
      this.config.sharedSecret
    );
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.browser) {
      await this.browser.disconnect();
      this.browser = null;
    }
  }
}
