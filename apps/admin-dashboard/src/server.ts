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

  const collectedRupees = ((stats.collectedPaise || 0) / 100).toFixed(2);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Openbill Pay System — Merchant Control Center</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0F19; color: #F8FAFC; margin: 0; padding: 2rem; }
    .card { background: #111827; border: 1px solid #1F2937; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; max-width: 900px; margin-left: auto; margin-right: auto; }
    .title { font-size: 1.4rem; font-weight: 700; color: #38BDF8; margin-bottom: 0.5rem; }
    .subtitle { color: #94A3B8; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .stat { background: #1E293B; border-radius: 12px; padding: 1rem; }
    .stat-label { font-size: 0.75rem; color: #94A3B8; text-transform: uppercase; }
    .stat-val { font-size: 1.5rem; font-weight: 800; color: #FFF; margin-top: 0.25rem; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
  </style>
</head>
<body>
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div class="title">Openbill Pay System</div>
        <div class="subtitle">Merchant Operations & Settlement Console</div>
      </div>
      <div class="badge">● Core Engine Active</div>
    </div>
    <div class="grid">
      <div class="stat"><div class="stat-label">Total Bills</div><div class="stat-val">${stats.totalBills}</div></div>
      <div class="stat"><div class="stat-label">Paid Bills</div><div class="stat-val" style="color:#10B981">${stats.paidBills}</div></div>
      <div class="stat"><div class="stat-label">Pending</div><div class="stat-val" style="color:#F59E0B">${stats.pendingBills}</div></div>
      <div class="stat"><div class="stat-label">Collected</div><div class="stat-val" style="color:#38BDF8">₹${collectedRupees}</div></div>
    </div>
    <p style="font-size:0.85rem; color:#64748B;">Automated bank alerts reconciled via Chrome DevTools Protocol & WhatsApp notifications active.</p>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`📊 Openbill Admin Dashboard listening on http://localhost:${PORT}`);
});
