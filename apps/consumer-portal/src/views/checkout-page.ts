import { UpiDeepLinks } from '../services/upi.js';

export interface CheckoutPageData {
  sessionId: string;
  billId: string;
  merchantName: string;
  upiVpa: string;
  consumerName: string;
  billingCycle: string;
  baseAmountPaise: number;
  fractionalOffset: number;
  allocatedAmountPaise: number;
  expiresAtTimestamp: number; // Unix seconds
  status: string;
  upiLinks: UpiDeepLinks;
  svgQr: string;
}

export function renderCheckoutHtml(data: CheckoutPageData): string {
  const baseRupees = (data.baseAmountPaise / 100).toFixed(2);
  const totalRupees = data.upiLinks.amountFormatted;
  const [intPart, decPart] = totalRupees.split('.');
  const offsetPaise = data.fractionalOffset;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Pay ₹${totalRupees} · ${data.merchantName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --surface: #121215;
      --surface-elevated: #18191f;
      --border-subtle: rgba(255, 255, 255, 0.07);
      --border-strong: rgba(255, 255, 255, 0.14);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-tertiary: #71717a;
      --accent-emerald: #10b981;
      --accent-emerald-dim: rgba(16, 185, 129, 0.12);
      --accent-coral: #f43f5e;
      --accent-coral-dim: rgba(244, 63, 94, 0.12);
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem 1rem;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Ambient structural surface */
    .portal-wrapper {
      width: 100%;
      max-width: 420px;
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .checkout-card {
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      width: 100%;
      padding: 1.75rem 1.75rem 1.5rem 1.75rem;
      position: relative;
      box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.03);
    }

    /* Merchant Header: Confident, calm authority */
    .merchant-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .merchant-profile {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }

    .merchant-avatar {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--surface-elevated);
      border: 1px solid var(--border-strong);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 1rem;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .merchant-meta h1 {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.3;
      letter-spacing: -0.01em;
    }

    .merchant-meta .vpa-text {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      margin-top: 1px;
    }

    /* Tabular Countdown Timer Pill */
    .timer-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      padding: 0.3125rem 0.625rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .timer-pill strong {
      color: var(--text-primary);
      font-weight: 600;
    }

    .timer-pill.urgent {
      background: var(--accent-coral-dim);
      border-color: rgba(244, 63, 94, 0.3);
      color: var(--accent-coral);
    }

    .timer-pill.urgent strong {
      color: var(--accent-coral);
    }

    /* Amount Presentation: The singular focal hero */
    .amount-hero {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .amount-caption {
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
      color: var(--text-tertiary);
      margin-bottom: 0.375rem;
    }

    .amount-val {
      font-size: clamp(2.5rem, 8vw, 3.125rem);
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.04em;
      line-height: 1;
      display: inline-flex;
      align-items: baseline;
      justify-content: center;
      font-variant-numeric: tabular-nums;
    }

    .amount-val .currency-symbol {
      font-size: 0.65em;
      font-weight: 500;
      margin-right: 0.1em;
      color: var(--text-secondary);
    }

    .amount-val .decimal-part {
      font-size: 0.65em;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .amount-context {
      margin-top: 0.625rem;
      font-size: 0.75rem;
      color: var(--text-tertiary);
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .amount-context strong {
      color: var(--text-secondary);
      font-weight: 500;
    }

    /* Precision Frame QR Code */
    .qr-container {
      background: #ffffff;
      padding: 1.125rem;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem auto;
      max-width: 230px;
      position: relative;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }

    .upi-vector-qr {
      width: 100%;
      height: auto;
      display: block;
    }

    .qr-badge {
      margin-top: 0.5rem;
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #52525b;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* Interactive Actions */
    .mobile-pay-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .btn-primary-intent {
      background: #ffffff;
      color: #09090b;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.8125rem 1.25rem;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      box-shadow: 0 4px 14px rgba(255, 255, 255, 0.1);
    }

    .btn-primary-intent:hover {
      background: #f4f4f5;
      transform: translateY(-1px);
    }

    .btn-primary-intent:active {
      transform: translateY(0);
      background: #e4e4e7;
    }

    /* Fast App Selector */
    .app-icons-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }

    .app-btn {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 0.625rem 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .app-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: var(--border-strong);
      color: var(--text-primary);
    }

    .app-btn-tag {
      font-weight: 600;
      font-size: 0.6875rem;
      color: var(--text-tertiary);
    }

    .desktop-only-help {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      text-align: center;
      margin-top: 0.625rem;
    }

    /* Live SSE Status Bar: Quiet, surgical radar */
    .sse-status-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-tertiary);
      margin-top: 1.375rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-subtle);
    }

    .radar-dot {
      width: 6px;
      height: 6px;
      background-color: var(--accent-emerald);
      border-radius: 50%;
      position: relative;
    }

    .radar-dot::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 1px solid var(--accent-emerald);
      opacity: 0.8;
      animation: ripple 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
    }

    @keyframes ripple {
      0% { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(2.4); opacity: 0; }
    }

    /* SUCCESS Overlay: Architectural state transition */
    .state-success-overlay {
      display: none;
      position: absolute;
      inset: 0;
      background: var(--surface);
      border-radius: 20px;
      z-index: 50;
      padding: 2.25rem 1.75rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      animation: fadeIn 0.25s ease-out forwards;
    }

    .state-success-overlay.visible {
      display: flex;
    }

    .success-icon-badge {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: var(--accent-emerald-dim);
      border: 1px solid rgba(16, 185, 129, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-emerald);
      margin-bottom: 1.25rem;
    }

    .success-receipt {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1rem;
      width: 100%;
      text-align: left;
      margin: 1.25rem 0 1.5rem 0;
      font-size: 0.8125rem;
    }

    .receipt-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      color: var(--text-tertiary);
    }

    .receipt-row:last-child {
      margin-bottom: 0;
    }

    .receipt-row strong {
      color: var(--text-primary);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .receipt-row .utr-code {
      color: var(--accent-emerald);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* EXPIRED Overlay */
    .state-expired-overlay {
      display: none;
      position: absolute;
      inset: 0;
      background: var(--surface);
      border-radius: 20px;
      z-index: 50;
      padding: 2.25rem 1.75rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      animation: fadeIn 0.25s ease-out forwards;
    }

    .state-expired-overlay.visible {
      display: flex;
    }

    .expired-icon-badge {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: var(--accent-coral-dim);
      border: 1px solid rgba(244, 63, 94, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-coral);
      margin-bottom: 1.25rem;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }

    /* Mobile Sheet Adaptation */
    @media (max-width: 640px) {
      body {
        padding: 0;
        justify-content: flex-end;
      }

      .portal-wrapper {
        max-width: 100%;
      }

      .checkout-card {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-left: none;
        border-right: none;
        border-bottom: none;
        padding: 1.5rem 1.25rem 2rem 1.25rem;
        box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.7);
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }

      .sheet-handle {
        width: 32px;
        height: 3px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 99px;
        margin: -0.5rem auto 1.25rem auto;
      }

      .qr-collapsible {
        display: none;
      }

      .qr-collapsible.show {
        display: flex;
      }

      .qr-toggle-btn {
        background: transparent;
        border: 1px solid var(--border-subtle);
        color: var(--text-secondary);
        padding: 0.625rem;
        border-radius: 10px;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        margin-bottom: 0.875rem;
        width: 100%;
        display: block;
        transition: all 0.15s ease;
      }

      .qr-toggle-btn:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: var(--border-strong);
      }
    }

    @media (min-width: 641px) {
      .sheet-handle { display: none; }
      .qr-toggle-btn { display: none; }
    }

    /* Discreet Developer Utility Dock */
    .dev-utility-dock {
      margin-top: 1rem;
      text-align: center;
    }

    .dev-sim-btn {
      background: transparent;
      border: 1px dashed rgba(255, 255, 255, 0.15);
      color: var(--text-tertiary);
      font-size: 0.6875rem;
      font-weight: 500;
      padding: 0.375rem 0.75rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      letter-spacing: 0.02em;
    }

    .dev-sim-btn:hover {
      border-color: rgba(255, 255, 255, 0.3);
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.02);
    }
  </style>
</head>
<body>

  <div class="portal-wrapper">
    <div class="checkout-card" id="checkoutCard">
      <!-- Sheet Handle for Mobile -->
      <div class="sheet-handle"></div>

      <!-- Merchant Header -->
      <div class="merchant-header">
        <div class="merchant-profile">
          <div class="merchant-avatar">${data.merchantName.charAt(0).toUpperCase()}</div>
          <div class="merchant-meta">
            <h1>${data.merchantName}</h1>
            <div class="vpa-text">${data.upiVpa}</div>
          </div>
        </div>

        <!-- 5-Minute Authoritative Countdown -->
        <div class="timer-pill" id="timerPill">
          <span>Expires</span>
          <strong id="countdownText">05:00</strong>
        </div>
      </div>

      <!-- Amount Hero -->
      <div class="amount-hero">
        <div class="amount-caption">Total Amount Due</div>
        <div class="amount-val">
          <span class="currency-symbol">₹</span>${intPart}<span class="decimal-part">.${decPart}</span>
        </div>
        <div>
          <span class="amount-context">
            Base ₹${baseRupees} + <strong>₹0.${offsetPaise.toString().padStart(2, '0')}</strong> precision match
          </span>
        </div>
      </div>

      <!-- Vector SVG QR View -->
      <button class="qr-toggle-btn" id="qrToggleBtn" onclick="toggleQrView()">
        Show QR Code
      </button>

      <div class="qr-container qr-collapsible" id="qrWrapper">
        ${data.svgQr}
        <div class="qr-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Direct Bank UPI Transfer
        </div>
      </div>

      <!-- Intent Launchers -->
      <div class="mobile-pay-section">
        <a href="${data.upiLinks.generic}" class="btn-primary-intent" id="primaryPayBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Pay via Installed UPI App
        </a>

        <!-- Fast App Launchers -->
        <div class="app-icons-grid">
          <a href="${data.upiLinks.googlePay}" class="app-btn" title="Pay with Google Pay">
            <span class="app-btn-tag">GPay</span>
          </a>
          <a href="${data.upiLinks.phonePe}" class="app-btn" title="Pay with PhonePe">
            <span class="app-btn-tag">PhonePe</span>
          </a>
          <a href="${data.upiLinks.paytm}" class="app-btn" title="Pay with Paytm">
            <span class="app-btn-tag">Paytm</span>
          </a>
        </div>
      </div>

      <div class="desktop-only-help">
        Scan the QR code with GPay, PhonePe, Paytm, or any UPI banking app.
      </div>

      <!-- SSE Status Radar -->
      <div class="sse-status-bar" id="sseStatusBar">
        <span class="radar-dot" id="statusDot"></span>
        <span id="sseStatusMessage">Awaiting payment confirmation...</span>
      </div>

      <!-- SUCCESS Overlay -->
      <div class="state-success-overlay" id="successOverlay">
        <div class="success-icon-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.375rem; letter-spacing: -0.02em;">Payment Verified</h2>
        <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Settlement confirmed via direct bank alert.
        </p>

        <div class="success-receipt">
          <div class="receipt-row">
            <span>Amount Paid</span>
            <strong>₹${totalRupees}</strong>
          </div>
          <div class="receipt-row">
            <span>Billing Cycle</span>
            <strong>${data.billingCycle}</strong>
          </div>
          <div class="receipt-row">
            <span>Bank Ref (UTR)</span>
            <strong class="utr-code" id="successUtr">--</strong>
          </div>
        </div>

        <button onclick="window.close()" class="btn-primary-intent" style="width: 100%;">
          Close Receipt
        </button>
      </div>

      <!-- EXPIRED Overlay -->
      <div class="state-expired-overlay" id="expiredOverlay">
        <div class="expired-icon-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.375rem; letter-spacing: -0.02em;">Session Timed Out</h2>
        <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
          This fractional payment slot has expired. Refresh to generate a new slot.
        </p>
        <button onclick="window.location.reload()" class="btn-primary-intent" style="width: 100%;">
          Refresh Session
        </button>
      </div>

    </div>

    <!-- Discreet Developer Utility -->
    <div class="dev-utility-dock">
      <button onclick="simulateBankPayment()" id="simBtn" class="dev-sim-btn">
        ⚡ Sandbox: Simulate Bank SMS Credit
      </button>
    </div>
  </div>

  <script>
    // 1. Mobile QR View Toggle
    function toggleQrView() {
      const qrEl = document.getElementById('qrWrapper');
      const btn = document.getElementById('qrToggleBtn');
      if (qrEl.classList.contains('show')) {
        qrEl.classList.remove('show');
        btn.textContent = 'Show QR Code';
      } else {
        qrEl.classList.add('show');
        btn.textContent = 'Hide QR Code';
      }
    }

    // Auto-open QR on desktop
    if (window.innerWidth > 640) {
      document.getElementById('qrWrapper').classList.add('show');
    }

    // 2. Server-Authoritative 5-Minute Countdown Timer
    const expiresAtSeconds = ${data.expiresAtTimestamp};
    const timerTextEl = document.getElementById('countdownText');
    const timerPillEl = document.getElementById('timerPill');
    const expiredOverlay = document.getElementById('expiredOverlay');
    let timerInterval = null;

    function updateTimer() {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const remainingSeconds = expiresAtSeconds - nowSeconds;

      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        timerTextEl.textContent = '00:00';
        expiredOverlay.classList.add('visible');
        if (eventSource) eventSource.close();
        return;
      }

      if (remainingSeconds <= 60) {
        timerPillEl.classList.add('urgent');
      }

      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      timerTextEl.textContent = 
        String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);

    // 3. Server-Sent Events (SSE) Listener for status mutation
    const sessionId = "${data.sessionId}";
    let eventSource = null;

    function initSseListener() {
      const sseStatusMsg = document.getElementById('sseStatusMessage');
      const statusDot = document.getElementById('statusDot');
      
      eventSource = new EventSource('/api/sessions/' + sessionId + '/stream');

      eventSource.addEventListener('status', function(event) {
        try {
          const payload = JSON.parse(event.data);
          console.log('[SSE] Received status event:', payload);

          if (payload.status === 'SUCCESS') {
            clearInterval(timerInterval);
            eventSource.close();
            
            if (payload.utr) {
              document.getElementById('successUtr').textContent = payload.utr;
            } else {
              document.getElementById('successUtr').textContent = 'VERIFIED_OK';
            }

            document.getElementById('successOverlay').classList.add('visible');
          }
        } catch (e) {
          console.error('[SSE] Error parsing status payload:', e);
        }
      });

      eventSource.onerror = function(err) {
        console.warn('[SSE] Connection error/closed, retrying...', err);
        sseStatusMsg.textContent = 'Connecting to payment observer...';
      };

      eventSource.onopen = function() {
        sseStatusMsg.textContent = 'Listening for incoming bank alert...';
      };
    }

    initSseListener();

    // 4. Sandbox simulation trigger
    async function simulateBankPayment() {
      const btn = document.getElementById('simBtn');
      if (btn) {
        btn.textContent = 'Simulating bank credit...';
        btn.disabled = true;
      }
      try {
        const res = await fetch('/api/sessions/' + sessionId + '/simulate-bank-payment', { method: 'POST' });
        const data = await res.json();
        console.log('[Sandbox Demo] Payment simulated successfully:', data);
      } catch (err) {
        console.error('[Sandbox Demo] Failed to simulate:', err);
        if (btn) {
          btn.textContent = 'Simulation error';
        }
      }
    }
  </script>
</body>
</html>`;
}
