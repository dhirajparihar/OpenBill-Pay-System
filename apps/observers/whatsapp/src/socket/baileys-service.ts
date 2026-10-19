import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { normalizeWhatsappPhone } from '../formatter/bill-notification-formatter.js';

export interface BaileysServiceConfig {
  /** Path to directory where authentication credentials will be stored */
  authDir?: string;
  /** Whether to print QR matrix to the terminal (default: true) */
  printTerminalQr?: boolean;
}

export class BaileysService extends EventEmitter {
  private socket: WASocket | null = null;
  private currentQr: string | null = null;
  private isOnline = false;
  private authDir: string;
  private printTerminalQr: boolean;

  constructor(config: BaileysServiceConfig = {}) {
    super();
    this.authDir = config.authDir || path.resolve(process.cwd(), '.baileys_auth');
    this.printTerminalQr = config.printTerminalQr ?? true;

    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  /**
   * Initializes Baileys multi-device socket connection
   */
  async start(): Promise<void> {
    console.log(`[WhatsApp Observer] Initializing multi-device session at: ${this.authDir}`);

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    const logger = pino({ level: 'silent' });

    this.socket = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false, // Handled manually with qrcode-terminal for formatting
      browser: ['Openbill Pay System', 'Chrome', '124.0.0'],
    });

    // Save auth credentials whenever updated
    this.socket.ev.on('creds.update', saveCreds);

    // Monitor connection lifecycle
    this.socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. QR Code generated for terminal / dashboard linking
      if (qr) {
        this.currentQr = qr;
        this.emit('qr', qr);

        if (this.printTerminalQr) {
          console.log('\n===============================================================');
          console.log('📱 SCAN THIS WHATSAPP QR CODE TO LINK OPENBILL PAY SYSTEM:');
          console.log('   (WhatsApp > Linked Devices > Link a Device)');
          console.log('===============================================================\n');
          qrcodeTerminal.generate(qr, { small: true });
          console.log('===============================================================\n');
        }
      }

      // 2. Connection opened
      if (connection === 'open') {
        this.isOnline = true;
        this.currentQr = null;
        const jid = this.socket?.user?.id || 'Merchant Device';
        console.log(`[WhatsApp Observer] ✓ Successfully linked & authenticated! Logged in as: ${jid}`);
        this.emit('connected', jid);
      }

      // 3. Connection closed / disconnected
      if (connection === 'close') {
        this.isOnline = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp Observer] Connection closed (code: ${statusCode}). Reconnect allowed: ${shouldReconnect}`);
        this.emit('disconnected', { statusCode, shouldReconnect });

        if (shouldReconnect) {
          console.log('[WhatsApp Observer] Attempting automatic reconnect in 5 seconds...');
          setTimeout(() => this.start(), 5000);
        } else {
          console.log('[WhatsApp Observer] Logged out from WhatsApp. Please clear .baileys_auth and re-scan QR.');
        }
      }
    });
  }

  /**
   * Sends a structured text message to a consumer phone number
   */
  async sendTextMessage(phone: string, text: string): Promise<boolean> {
    if (!this.socket || !this.isOnline) {
      console.warn(`[WhatsApp Observer] Cannot send message: Baileys socket is offline.`);
      return false;
    }

    const normalizedPhone = normalizeWhatsappPhone(phone);
    const jid = `${normalizedPhone}@s.whatsapp.net`;

    try {
      console.log(`[WhatsApp Observer] Dispatching message to ${jid}...`);
      await this.socket.sendMessage(jid, { text });
      console.log(`[WhatsApp Observer] ✓ Message sent successfully to ${jid}`);
      return true;
    } catch (err) {
      console.error(`[WhatsApp Observer] ✗ Failed to send message to ${jid}:`, err);
      return false;
    }
  }

  getQr(): string | null {
    return this.currentQr;
  }

  isConnected(): boolean {
    return this.isOnline;
  }

  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
      this.isOnline = false;
    }
  }
}
