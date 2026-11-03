/**
 * Batch & Autonomous Audit Orchestrator for HTML-2-Fig
 *
 * Runs comprehensive visual, geometric, typography, and stacking audits
 * across hundreds or thousands of target websites in parallel.
 *
 * Usage:
 *   node scripts/batch_audit.js --sites=scripts/benchmark_sites.json --category=saas_modern
 *   node scripts/batch_audit.js --url=https://example.com,https://stripe.com
 *   node scripts/batch_audit.js --file=urls.txt --concurrency=3
 */

const fs = require('fs');
const path = require('path');
const { auditUrl } = require('./audit_layout');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT_DIR, 'audit_reports');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    urls: [],
    concurrency: 2,
    maxSites: 100,
    category: null
  };

  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      options.urls = arg.slice(6).split(',').map(u => u.trim()).filter(Boolean);
    } else if (arg.startsWith('--sites=')) {
      const filePath = path.resolve(arg.slice(8));
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          if (filePath.endsWith('.json')) {
            const data = JSON.parse(raw);
            if (Array.isArray(data)) {
              options.urls = data;
            } else if (data.categories) {
              options.siteCategories = data.categories;
            }
          } else {
            options.urls = raw.split(/\r?\n/).map(u => u.trim()).filter(u => u && !u.startsWith('#'));
          }
        } catch (e) {
          console.error(`Failed to read sites file: ${filePath}`, e);
        }
      }
    } else if (arg.startsWith('--file=')) {
      const filePath = path.resolve(arg.slice(7));
      if (fs.existsSync(filePath)) {
        options.urls = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).map(u => u.trim()).filter(u => u && !u.startsWith('#'));
      }
    } else if (arg.startsWith('--category=')) {
      options.category = arg.slice(11).trim();
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.slice(14), 10) || 2;
    } else if (arg.startsWith('--max=')) {
      options.maxSites = parseInt(arg.slice(6), 10) || 100;
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
      options.urls.push(arg);
    }
  }

  if (options.siteCategories) {
    if (options.category && options.siteCategories[options.category]) {
      options.urls = options.siteCategories[options.category];
    } else if (!options.urls.length) {
      options.urls = Object.values(options.siteCategories).flat();
    }
  }

  if (!options.urls.length) {
    options.urls = ['https://example.com'];
  }

  if (options.urls.length > options.maxSites) {
    options.urls = options.urls.slice(0, options.maxSites);
  }

  return options;
}

async function runWorker(queue, results, total) {
  while (queue.length > 0) {
    const item = queue.shift();
    const index = total - queue.length;
    console.log(`\n[${index}/${total}] Processing site: ${item.url}`);
    const start = Date.now();
    try {
      const auditResult = await auditUrl(item.url);
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      results.push({
        url: item.url,
        passed: auditResult.passed,
        compositeScore: auditResult.compositeScore,
        anomalies: auditResult.anomalies,
        reportPath: auditResult.reportPath,
        duration: `${duration}s`,
        error: null
      });
      console.log(`✓ [${index}/${total}] ${item.url} completed in ${duration}s (Score: ${auditResult.compositeScore}%, Defects: ${auditResult.anomalies.length})`);
    } catch (err) {
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`✗ [${index}/${total}] ${item.url} failed with error:`, err.message || err);
      results.push({
        url: item.url,
        passed: false,
        compositeScore: 0,
        anomalies: [{ severity: 'CRITICAL', category: 'RUNTIME', type: 'AUDIT_CRASH', description: String(err.message || err) }],
        reportPath: null,
        duration: `${duration}s`,
        error: err.message || String(err)
      });
    }
  }
}

function generateDashboardHtml(results, summary) {
  const rows = results.map((r, i) => {
    const statusBg = r.passed ? '#064e3b' : '#7f1d1d';
    const statusColor = r.passed ? '#34d399' : '#f87171';
    const statusText = r.passed ? 'PASSED' : 'DEFECTS DETECTED';
    const reportLink = r.reportPath ? `<a href="${path.basename(r.reportPath)}" target="_blank" style="color:#60a5fa;text-decoration:none;">View Report ↗</a>` : 'N/A';
    const scoreColor = r.compositeScore >= 90 ? '#34d399' : r.compositeScore >= 70 ? '#fbbf24' : '#f87171';
    return `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:12px;color:#94a3b8;">#${i + 1}</td>
        <td style="padding:12px;"><a href="${r.url}" target="_blank" style="color:#f1f5f9;font-weight:600;text-decoration:none;">${r.url}</a></td>
        <td style="padding:12px;"><span style="background:${statusBg};color:${statusColor};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;">${statusText}</span></td>
        <td style="padding:12px;font-weight:700;color:${scoreColor};">${r.compositeScore}%</td>
        <td style="padding:12px;color:#f87171;font-weight:600;">${r.anomalies.length}</td>
        <td style="padding:12px;color:#94a3b8;">${r.duration}</td>
        <td style="padding:12px;">${reportLink}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>HTML-2-Fig Fleet Audit Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; margin: 0; padding: 32px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 26px; margin: 0 0 8px 0; color: #f8fafc; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 28px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .metric-card { background: #131b2e; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; }
    .metric-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 6px; }
    .metric-value { font-size: 32px; font-weight: 800; color: #f8fafc; }
    table { width: 100%; border-collapse: collapse; background: #131b2e; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; }
    th { background: #0f172a; padding: 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 HTML-2-Fig Fleet Audit Dashboard</h1>
    <div class="subtitle">Automated Multi-Site Geometric, Typography, and Styling Verification Engine — Generated at ${new Date().toISOString()}</div>
    
    <div class="metrics">
      <div class="metric-card">
        <div class="metric-title">Total Sites Checked</div>
        <div class="metric-value">${summary.total}</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Pass Rate</div>
        <div class="metric-value" style="color:${summary.passRate >= 90 ? '#34d399' : '#f87171'};">${summary.passRate}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Avg Fidelity Score</div>
        <div class="metric-value" style="color:#60a5fa;">${summary.avgScore}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Total Defects Flagged</div>
        <div class="metric-value" style="color:${summary.totalDefects === 0 ? '#34d399' : '#f87171'};">${summary.totalDefects}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:50px;">Index</th>
          <th>Website URL</th>
          <th style="width:160px;">Status</th>
          <th style="width:120px;">Fidelity</th>
          <th style="width:100px;">Defects</th>
          <th style="width:100px;">Duration</th>
          <th style="width:120px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function main() {
  const options = parseArgs();
  console.log(`\n======================================================`);
  console.log(`🎯 [HTML-2-Fig Batch Audit] Fleet Test Started`);
  console.log(`   Target Sites: ${options.urls.length}`);
  console.log(`   Concurrency:  ${options.concurrency}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const queue = options.urls.map(url => ({ url }));
  const results = [];
  const total = queue.length;

  const workers = [];
  for (let i = 0; i < Math.min(options.concurrency, total); i++) {
    workers.push(runWorker(queue, results, total));
  }

  await Promise.all(workers);

  const passedCount = results.filter(r => r.passed).length;
  const totalDefects = results.reduce((acc, r) => acc + r.anomalies.length, 0);
  const avgScore = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.compositeScore, 0) / results.length) : 0;
  const passRate = results.length > 0 ? Math.round((passedCount / results.length) * 100) : 0;

  const summary = {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    passRate,
    avgScore,
    totalDefects,
    timestamp: new Date().toISOString()
  };

  const summaryJsonPath = path.join(REPORT_DIR, 'batch_summary.json');
  fs.writeFileSync(summaryJsonPath, JSON.stringify({ summary, results }, null, 2), 'utf8');

  const dashboardHtmlPath = path.join(REPORT_DIR, 'batch_dashboard.html');
  fs.writeFileSync(dashboardHtmlPath, generateDashboardHtml(results, summary), 'utf8');

  console.log(`\n======================================================`);
  console.log(`🏁 [Batch Audit Complete] Results:`);
  console.log(`   Passed:        ${passedCount}/${results.length} (${passRate}%)`);
  console.log(`   Avg Score:     ${avgScore}%`);
  console.log(`   Total Defects: ${totalDefects}`);
  console.log(`   Dashboard:     ${dashboardHtmlPath}`);
  console.log(`======================================================\n`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Batch audit crashed:', err);
    process.exit(1);
  });
}

module.exports = { main };

