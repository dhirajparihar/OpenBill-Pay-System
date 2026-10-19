import concurrently from 'concurrently';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');

console.log(`
\x1b[36m================================================================================
  🏛️  OPENBILL PAY SYSTEM — PROCESS CONTROL CENTER
  Sovereign, Zero-Docker Microservices Process Supervisor
================================================================================\x1b[0m
  • CORE-API   : http://localhost:7100 (DB Engine, Slot Allocator, Reconciler)
  • CHECKOUT   : http://localhost:8000 (Consumer Portal & Vector SVG QR)
  • ADMIN-UI   : http://localhost:7001 (Merchant Dashboard & Settlements)
  • WA-DUNNING : http://localhost:7300 (Baileys WhatsApp Observer & Dunning)
  • SMS-OBS    : http://localhost:7200 (CDP Google Messages Bank SMS Scraper)
\x1b[36m================================================================================\x1b[0m
`);

// Environment propagation helper
const baseEnv = {
  ...process.env,
  DATABASE_PATH: path.resolve(ROOT_DIR, 'openbill.db'),
  SHARED_SYSTEM_SECRET: process.env.SHARED_SYSTEM_SECRET || 'openbill_system_secret_2026',
  BILLING_CORE_URL: 'http://localhost:7100',
  CONSUMER_PORTAL_URL: 'http://localhost:8000',
};

const services = [
  {
    command: 'node apps/billing-core/dist/server.js',
    name: 'CORE-API',
    prefixColor: 'blue.bold',
    env: {
      ...baseEnv,
      PORT: '7100',
    },
  },
  {
    command: 'node apps/consumer-portal/dist/server.js',
    name: 'CHECKOUT',
    prefixColor: 'cyan.bold',
    env: {
      ...baseEnv,
      PORT: '8000',
    },
  },
  {
    command: 'node apps/admin-dashboard/dist/server.js',
    name: 'ADMIN-UI',
    prefixColor: 'magenta.bold',
    env: {
      ...baseEnv,
      PORT: '7001',
    },
  },
  {
    command: 'node apps/observers/whatsapp/dist/index.js',
    name: 'WA-DUNNING',
    prefixColor: 'green.bold',
    env: {
      ...baseEnv,
      PORT: '7300',
      WHATSAPP_SESSION_PATH: path.resolve(ROOT_DIR, '.baileys_auth'),
    },
  },
  {
    command: 'node apps/observers/bank-sms/dist/index.js',
    name: 'SMS-OBS',
    prefixColor: 'yellow.bold',
    env: {
      ...baseEnv,
      PORT: '7200',
      GOOGLE_MESSAGES_CDP_PORT: process.env.GOOGLE_MESSAGES_CDP_PORT || '9222',
    },
  },
];

// Launch via concurrently with safe failure cascading
const { result, commands } = concurrently(services, {
  prefix: '{time} [{name}]',
  timestampFormat: 'HH:mm:ss',
  killOthers: ['failure'], // Automatically shutdown sibling services if a core service crashes
  restartTries: 1,         // Attempt single auto-restart before escalating
  restartDelay: 1500,
  cwd: ROOT_DIR,
});

result.then(
  () => {
    console.log('\n\x1b[32m[Control Center] All services stopped cleanly.\x1b[0m');
    process.exit(0);
  },
  (failures) => {
    console.error('\n\x1b[31m[Control Center] Critical process failure detected in one or more microservices:\x1b[0m');
    for (const fail of failures) {
      if (fail.exitCode !== 0) {
        console.error(` - Service [${fail.command.name}] exited with code: ${fail.exitCode}`);
      }
    }
    console.error('\x1b[31m[Control Center] Clean shutdown initiated.\x1b[0m');
    process.exit(1);
  }
);

// Graceful signal handling for Ctrl+C
const handleTermination = (signal) => {
  console.log(`\n[Control Center] Received ${signal}. Initiating orderly teardown...`);
  for (const cmd of commands) {
    try {
      cmd.kill();
    } catch {}
  }
};

process.on('SIGINT', () => handleTermination('SIGINT'));
process.on('SIGTERM', () => handleTermination('SIGTERM'));
