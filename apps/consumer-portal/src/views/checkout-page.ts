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
  const offsetPaise = data.fractionalOffset;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Pay ₹${totalRupees} to ${data.merchantName} | Openbill Pay System</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --accent: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --upi-green: #00875a;
      --font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
        radial-gradient(circle at 80% 100%, rgba(16, 185, 129, 0.08) 0%, transparent 50%);
    }

    /* Container for Desktop Card & Mobile Bottom Sheet */
    .portal-wrapper {
      width: 100%;
      max-width: 440px;
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .checkout-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      width: 100%;
      padding: 1.75rem;
      box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      position: relative;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Merchant Branding Header */
    .merchant-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .merchant-avatar {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 1.2rem;
      color: #fff;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }

    .merchant-info h1 {
      font-size: 1.05rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.2;
    }

    .merchant-info .vpa-badge {
      font-size: 0.75rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-top: 2px;
    }

    .verified-icon {
      color: #38bdf8;
      width: 14px;
      height: 14px;
      display: inline-block;
    }

    /* Total Amount Section */
    .amount-box {
      text-align: center;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      margin-bottom: 1.25rem;
    }

    .amount-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }

    .amount-val {
      font-size: 2.25rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.03em;
      margin: 0.25rem 0;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 2px;
    }

    .amount-val span.currency {
      font-size: 1.5rem;
      font-weight: 700;
      color: #94a3b8;
    }

    .amount-val span.fraction {
      font-size: 1.6rem;
      color: #38bdf8;
    }

    .fraction-note {
      font-size: 0.72rem;
      color: #cbd5e1;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.2);
      padding: 0.35rem 0.65rem;
      border-radius: 20px;
      display: inline-block;
      margin-top: 0.25rem;
    }

    /* Timer Pill */
    .timer-pill {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
    }

    .timer-pill.urgent {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
      animation: pulse 1s infinite alternate;
    }

    @keyframes pulse {
      from { opacity: 0.8; }
      to { opacity: 1; transform: scale(1.02); }
    }

    /* QR Code Box */
    .qr-container {
      background: #ffffff;
      padding: 1.1rem;
      border-radius: 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
      margin: 0 auto 1.25rem auto;
      max-width: 250px;
      position: relative;
    }

    .upi-vector-qr {
      width: 100%;
      height: auto;
      display: block;
    }

    .qr-footer-tag {
      margin-top: 0.4rem;
      font-size: 0.68rem;
      font-weight: 700;
      color: #475569;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Mobile Quick Pay Intent Buttons */
    .mobile-pay-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .btn-primary-intent {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      font-weight: 700;
      font-size: 1rem;
      padding: 0.9rem 1.25rem;
      border-radius: 14px;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      cursor: pointer;
      text-decoration: none;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .btn-primary-intent:active {
      transform: scale(0.98);
    }

    /* Quick App Icon Buttons */
    .app-icons-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
      margin-top: 0.25rem;
    }

    .app-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 0.65rem 0.4rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      text-decoration: none;
      color: #e2e8f0;
      font-size: 0.75rem;
      font-weight: 600;
      transition: all 0.2s;
    }

    .app-btn:hover, .app-btn:active {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    .app-btn-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.75rem;
    }

    .icon-gpay { background: #fff; color: #1f2937; }
    .icon-phonepe { background: #5f259f; color: #fff; }
    .icon-paytm { background: #00baf2; color: #fff; }

    /* Live SSE Status Bar */
    .sse-status-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 1.25rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .pulsing-dot {
      width: 8px;
      height: 8px;
      background-color: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulse-green 1.6s infinite;
    }

    @keyframes pulse-green {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    /* SUCCESS State Overlay */
    .state-success-overlay {
      display: none;
      position: absolute;
      inset: 0;
      background: var(--card-bg);
      border-radius: 24px;
      z-index: 50;
      padding: 2rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      animation: fadeIn 0.4s ease forwards;
    }

    .state-success-overlay.visible {
      display: flex;
    }

    .success-checkmark-circle {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      border: 2px solid var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      margin-bottom: 1.25rem;
      animation: bounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes bounce {
      0% { transform: scale(0.3); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    /* EXPIRED State Overlay */
    .state-expired-overlay {
      display: none;
      position: absolute;
      inset: 0;
      background: var(--card-bg);
      border-radius: 24px;
      z-index: 50;
      padding: 2rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .state-expired-overlay.visible {
      display: flex;
    }

    /* Mobile Bottom Sheet Media Queries */
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
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.6);
        animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }

      /* Mobile drag handle */
      .sheet-handle {
        width: 38px;
        height: 4px;
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
        border: 1px dashed rgba(255, 255, 255, 0.15);
        color: var(--text-muted);
        padding: 0.6rem;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 0.75rem;
        width: 100%;
        display: block;
      }
    }

    @media (min-width: 641px) {
      .sheet-handle { display: none; }
      .qr-toggle-btn { display: none; }
      .desktop-only-help {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-align: center;
        margin-top: 0.5rem;
      }
    }
  </style>
</head>
<body>

  <div class="portal-wrapper">
    <div class="checkout-card" id="checkoutCard">
      <!-- Mobile drag handle -->
      <div class="sheet-handle"></div>

      <!-- Merchant Header -->
      <div class="merchant-header">
        <div class="merchant-avatar">${data.merchantName.charAt(0).toUpperCase()}</div>
        <div class="merchant-info">
          <h1>${data.merchantName}</h1>
          <div class="vpa-badge">
            <span>${data.upiVpa}</span>
            <svg class="verified-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Amount Section -->
      <div class="amount-box">
        <div class="amount-label">Exact Payable Amount</div>
        <div class="amount-val">
          <span class="currency">₹</span>
          <span>${totalRupees.split('.')[0]}</span>
          <span class="fraction">.${totalRupees.split('.')[1]}</span>
        </div>
        <div class="fraction-note">
          Includes <strong>+₹0.${offsetPaise.toString().padStart(2, '0')}</strong> fractional slot for instant verification
        </div>
      </div>

      <!-- Server Authoritative Countdown Timer -->
      <div class="timer-pill" id="timerPill">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>Expires in: <strong id="countdownText">05:00</strong></span>
      </div>

      <!-- Vector SVG QR Section -->
      <button class="qr-toggle-btn" id="qrToggleBtn" onclick="toggleQrView()">
        Show QR Code to Scan
      </button>

      <div class="qr-container qr-collapsible" id="qrWrapper">
        ${data.svgQr}
        <div class="qr-footer-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          NPCI SECURED UPI QR
        </div>
      </div>

      <!-- Mobile Intent Buttons -->
      <div class="mobile-pay-section">
        <a href="${data.upiLinks.generic}" class="btn-primary-intent" id="primaryPayBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Pay via Any Installed App
        </a>

        <!-- Fast App Launchers -->
        <div class="app-icons-grid">
          <a href="${data.upiLinks.googlePay}" class="app-btn" title="Pay with Google Pay">
            <div class="app-btn-icon icon-gpay">G</div>
            <span>GPay</span>
          </a>
          <a href="${data.upiLinks.phonePe}" class="app-btn" title="Pay with PhonePe">
            <div class="app-btn-icon icon-phonepe">Pe</div>
            <span>PhonePe</span>
          </a>
          <a href="${data.upiLinks.paytm}" class="app-btn" title="Pay with Paytm">
            <div class="app-btn-icon icon-paytm">₹</div>
            <span>Paytm</span>
          </a>
        </div>
      </div>

      <div class="desktop-only-help">
        Scan using any UPI app: Google Pay, PhonePe, Paytm, CRED, or BHIM.
      </div>

      <!-- SSE Live Status Indicator -->
      <div class="sse-status-bar" id="sseStatusBar">
        <span class="pulsing-dot" id="statusDot"></span>
        <span id="sseStatusMessage">Awaiting payment confirmation...</span>
      </div>

      <!-- Interactive Sandbox Payment Trigger for Live Testing -->
      <div style="margin-top: 0.85rem; text-align: center;">
        <button onclick="simulateBankPayment()" id="simBtn" style="background: rgba(16,185,129,0.12); border: 1px dashed rgba(16,185,129,0.4); color: #34d399; font-size: 0.78rem; font-weight: 600; padding: 0.5rem 0.85rem; border-radius: 10px; cursor: pointer; transition: all 0.2s;">
          ⚡ [Sandbox Demo] Simulate Bank SMS Credit
        </button>
      </div>

      <!-- SUCCESS State Modal/Overlay -->
      <div class="state-success-overlay" id="successOverlay">
        <div class="success-checkmark-circle">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2 style="font-size: 1.4rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">Payment Successful!</h2>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Verified and credited via Bank SMS alert.
        </p>

        <div style="background: rgba(255,255,255,0.04); border-radius: 14px; padding: 1rem; width: 100%; text-align: left; margin-bottom: 1.5rem; font-size: 0.82rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem;">
            <span style="color: var(--text-muted)">Amount Paid:</span>
            <strong style="color: #fff">₹${totalRupees}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem;">
            <span style="color: var(--text-muted)">Billing Cycle:</span>
            <strong style="color: #fff">${data.billingCycle}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted)">Bank Ref (UTR):</span>
            <strong style="color: #38bdf8" id="successUtr">--</strong>
          </div>
        </div>

        <button onclick="window.close()" class="btn-primary-intent" style="width: 100%; background: #10b981;">
          Done
        </button>
      </div>

      <!-- EXPIRED State Overlay -->
      <div class="state-expired-overlay" id="expiredOverlay">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: center; color: #ef4444; margin-bottom: 1rem;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h2 style="font-size: 1.3rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">Session Expired</h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
          The allocated fractional slot timed out. Please regenerate a fresh session to pay safely.
        </p>
        <button onclick="window.location.reload()" class="btn-primary-intent" style="width: 100%;">
          Regenerate QR Code
        </button>
      </div>

    </div>
  </div>

  <script>
    // 1. Mobile QR Toggle
    function toggleQrView() {
      const qrEl = document.getElementById('qrWrapper');
      const btn = document.getElementById('qrToggleBtn');
      if (qrEl.classList.contains('show')) {
        qrEl.classList.remove('show');
        btn.textContent = 'Show QR Code to Scan';
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

    // 3. Server-Sent Events (SSE) Listener for 'SUCCESS' status mutation
    const sessionId = "${data.sessionId}";
    let eventSource = null;

    function initSseListener() {
      const sseStatusMsg = document.getElementById('sseStatusMessage');
      const statusDot = document.getElementById('statusDot');
      
      // Connect to SSE stream
      eventSource = new EventSource('/api/sessions/' + sessionId + '/stream');

      eventSource.addEventListener('status', function(event) {
        try {
          const payload = JSON.parse(event.data);
          console.log('[SSE] Received status event:', payload);

          if (payload.status === 'SUCCESS') {
            clearInterval(timerInterval);
            eventSource.close();
            
            // Populate UTR if present
            if (payload.utr) {
              document.getElementById('successUtr').textContent = payload.utr;
            } else {
              document.getElementById('successUtr').textContent = 'VERIFIED_OK';
            }

            // Reveal Success UI
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

    // Sandbox simulation trigger
    async function simulateBankPayment() {
      const btn = document.getElementById('simBtn');
      if (btn) {
        btn.textContent = 'Triggering simulated credit...';
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
