import { BaileysService } from './socket/baileys-service.js';
import { BillReminderScheduler } from './scheduler/bill-scheduler.js';

export * from './formatter/bill-notification-formatter.js';
export * from './socket/baileys-service.js';
export * from './scheduler/bill-scheduler.js';

if (process.env.NODE_ENV !== 'test') {
  const authDir = process.env.WHATSAPP_SESSION_PATH || './.baileys_auth';
  const portalUrl = process.env.CONSUMER_PORTAL_URL || 'http://localhost:3000';

  const baileys = new BaileysService({ authDir, printTerminalQr: true });
  const scheduler = new BillReminderScheduler(baileys, {
    consumerPortalUrl: portalUrl,
    morningHour: parseInt(process.env.SCHEDULE_HOUR || '9', 10),
    morningMinute: parseInt(process.env.SCHEDULE_MINUTE || '0', 10),
  });

  baileys.start()
    .then(() => {
      scheduler.start();
    })
    .catch((err) => {
      console.error('[WhatsApp Observer] Startup failure:', err);
    });
}
