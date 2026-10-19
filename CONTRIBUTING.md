# Contributing to Openbill Pay System

Thank you for your interest in contributing to **Openbill Pay System**! Openbill is a sovereign, self-hosted recurring bill collection and zero-fee UPI automation system.

## Code of Conduct
We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful and constructive in all discussions, pull requests, and issue reports.

## Architecture Guidelines
Before contributing code, please keep these core design invariants in mind:

1. **Strict 64-bit Integer Accounting (Paise)**:
   - NEVER store or calculate monetary amounts as floating-point numbers.
   - Always represent currency as integer Paise (₹1500.00 = `150000`).
2. **Zero-Docker Runtime**:
   - The project is designed to run bare-metal on Node.js 20+ LTS with SQLite3 in WAL mode.
   - Do not introduce mandatory Docker, Redis, or external cloud service requirements.
3. **No External SaaS Dependencies for Core Functionality**:
   - QR codes must remain dynamic inline vector SVGs generated client/server-side without third-party chart APIs.
   - Observers must remain fully self-hostable (Chrome CDP & Baileys socket).
4. **Cryptographic Integrity**:
   - All external webhooks and internal inter-service observer messages must be signed using HMAC-SHA256 and compared using constant-time verification (`crypto.timingSafeEqual`).

## Development Setup

```bash
# 1. Clone repository
git clone https://github.com/your-username/openbill-pay-system.git
cd openbill-pay-system

# 2. Install dependencies & initialize workspace
npm install

# 3. Build all TypeScript packages
npm run build

# 4. Run test suites
npm test

# 5. Launch process supervisor
npm run dev
```

## Pull Request Guidelines
- Ensure all test suites pass cleanly (`npm test`).
- Add tests for new bank regex parsers or allocation edge cases.
- Follow existing TypeScript conventions and file structure.
- Write clear, concise commit messages.
