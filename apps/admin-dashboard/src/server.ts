import express, { Request, Response } from 'express';
import { sqlite } from '@openbill/database';

const app = express();
const PORT = process.env.PORT || 7001;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  const stats = sqlite.prepare(`
    SELECT 
      COUNT(*) as totalBills,
      SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paidBills,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingBills,
      SUM(CASE WHEN status = 'PAID' THEN base_amount_paise ELSE 0 END) as collectedPaise
    FROM bills
  `).get() as { totalBills: number; paidBills: number; pendingBills: number; collectedPaise: number | null };

  const collectedRupees = ((stats.collectedPaise || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merchant Console · Openbill Pay System</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --surface: #121215;
      --surface-subtle: #18191f;
      --border-subtle: rgba(255, 255, 255, 0.07);
      --border-strong: rgba(255, 255, 255, 0.12);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-tertiary: #71717a;
      --emerald: #10b981;
      --emerald-dim: rgba(16, 185, 129, 0.12);
      --amber: #f59e0b;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem 1.5rem;
      -webkit-font-smoothing: antialiased;
    }

    .console-container {
      width: 100%;
      max-width: 860px;
    }

    /* Header Bar */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .brand-title {
      font-size: 1.125rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .brand-subtitle {
      font-size: 0.8125rem;
      color: var(--text-tertiary);
      margin-top: 0.25rem;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3125rem 0.625rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      background: var(--emerald-dim);
      color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
    }

    /* Grid layout */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 680px) {
      .metrics-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .metric-caption {
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
      font-weight: 600;
    }

    .metric-val {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      margin-top: 0.5rem;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }

    .metric-val.paid {
      color: var(--emerald);
    }

    .metric-val.pending {
      color: var(--amber);
    }

    /* System Operational Feed */
    .system-card {
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 1.25rem 1.5rem;
    }

    .system-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .spec-list {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
      font-size: 0.75rem;
      color: var(--text-tertiary);
      border-top: 1px solid var(--border-subtle);
      padding-top: 1rem;
    }

    .spec-item strong {
      display: block;
      color: var(--text-primary);
      font-size: 0.8125rem;
      margin-bottom: 0.125rem;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="console-container">
    <div class="top-bar">
      <div>
        <div class="brand-title">Openbill Pay System</div>
        <div class="brand-subtitle">Sovereign Peer-to-Peer Reconciliation Console</div>
      </div>
      <div class="status-badge">
        <span class="status-dot"></span>
        <span>Reconciliation Active</span>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-caption">Total Issued</div>
        <div class="metric-val">${stats.totalBills}</div>
      </div>
      <div class="metric-card">
        <div class="metric-caption">Settled (T+0)</div>
        <div class="metric-val paid">${stats.paidBills}</div>
      </div>
      <div class="metric-card">
        <div class="metric-caption">Pending Alert</div>
        <div class="metric-val pending">${stats.pendingBills}</div>
      </div>
      <div class="metric-card">
        <div class="metric-caption">Net Collected</div>
        <div class="metric-val">₹${collectedRupees}</div>
      </div>
    </div>

    <div class="system-card">
      <div class="system-title">
        <span>Institutional Zero-Fee Architecture</span>
      </div>
      <div class="spec-list">
        <div class="spec-item">
          <strong>Direct Bank Credit</strong>
          Zero gateway intermediary or rolling reserves (T+0)
        </div>
        <div class="spec-item">
          <strong>Local SQLite WAL</strong>
          Deterministic single-file ledger with immediate transaction locks
        </div>
        <div class="spec-item">
          <strong>Observers Active</strong>
          Google Messages Chrome CDP + Baileys WhatsApp Socket
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`📊 Openbill Admin Dashboard listening on http://localhost:${PORT}`);
});
