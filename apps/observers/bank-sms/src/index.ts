import { GoogleMessagesObserver } from './cdp/messages-listener.js';
export * from './parser/bank-sms-parser.js';
export * from './reconciler/reconcile-client.js';
export * from './cdp/messages-listener.js';

// Auto-run if executed directly
if (process.env.NODE_ENV !== 'test') {
  const cdpPort = parseInt(process.env.GOOGLE_MESSAGES_CDP_PORT || '9222', 10);
  const observer = new GoogleMessagesObserver({
    cdpPort,
    billingCoreUrl: process.env.BILLING_CORE_URL || 'http://localhost:7100',
    sharedSecret: process.env.SHARED_SYSTEM_SECRET || 'openbill_system_secret_2026',
  });

  async function connectWithRetry() {
    try {
      await observer.start();
    } catch {
      console.log(`[SMS-OBS] Chrome CDP on port ${cdpPort} not yet connected. Will retry in 15 seconds...`);
      setTimeout(connectWithRetry, 15000);
    }
  }

  connectWithRetry();
}
