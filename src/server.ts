import * as http from 'http';
import {
  Toka,
  MemoryCache,
  createMockProvider,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
  MultiProvider,
  defaultPricingRegistry,
  getPricing,
  calculateCost,
  TokaError,
  TokaBudgetExceededError,
  InMemoryBudgetStore,
  BudgetPolicy,
  BudgetContext,
  AIProvider,
} from './index';
import { estimateCost } from './cost/estimator';
import { getNextModel } from './fallback/modelFallback';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Global shared instances for the server
const sharedCache = new MemoryCache();
const sharedBudgetStore = new InMemoryBudgetStore();

const supportedModels = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-3.5-turbo',
  'claude-3-5-sonnet',
  'claude-3-5-haiku',
  'claude-3-opus',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'deepseek-chat',
  'deepseek-reasoner',
];

function getProvider(options?: { provider?: string; apiKey?: string }): AIProvider {
  const customKey = options?.apiKey;
  const customProvider = options?.provider?.toLowerCase();

  return new MultiProvider({
    openaiOptions: {
      apiKey: (customProvider === 'openai' ? customKey : undefined) || process.env.OPENAI_API_KEY,
    },
    anthropicOptions: {
      apiKey: (customProvider === 'anthropic' ? customKey : undefined) || process.env.ANTHROPIC_API_KEY,
    },
    geminiOptions: {
      apiKey: (customProvider === 'gemini' ? customKey : undefined) || process.env.GEMINI_API_KEY,
    },
    deepseekOptions: {
      apiKey: (customProvider === 'deepseek' ? customKey : undefined) || process.env.DEEPSEEK_API_KEY,
    },
    allowMockFallback: true,
  });
}

function parseJsonBody(
  req: http.IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown
) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(json);
}

function getIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Toka - LLM Cost-Control & Observability</title>
  <meta name="description" content="TypeScript cost-control and observability architecture for LLM applications.">
  <meta property="og:title" content="Toka - LLM Cost-Control & Observability">
  <meta property="og:description" content="TypeScript cost-control and observability architecture for LLM applications.">
  <style>
    :root {
      --bg: #0b0f19;
      --card: #111827;
      --border: #1f293d;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.15);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --code-bg: #030712;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); line-height: 1.5; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 20px; margin-bottom: 28px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo-badge { background: linear-gradient(135deg, #2563eb, #7c3aed); width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: white; }
    h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .tagline { font-size: 13px; color: var(--muted); }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.12); color: var(--success); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; flex-wrap: wrap; }
    .tab-btn { background: none; border: none; color: var(--muted); padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
    .tab-btn:hover { color: var(--text); background: var(--border); }
    .tab-btn.active { color: white; background: var(--accent); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #e5e7eb; display: flex; align-items: center; gap: 8px; }
    label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px; }
    input, textarea, select { width: 100%; background: var(--code-bg); border: 1px solid var(--border); color: var(--text); padding: 10px 12px; border-radius: 8px; font-size: 14px; margin-bottom: 14px; outline: none; }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
    textarea { resize: vertical; min-height: 80px; }
    .btn { background: var(--accent); color: white; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .btn:hover { opacity: 0.9; }
    .btn-secondary { background: var(--border); color: var(--text); }
    .btn-secondary:hover { background: #2d3b55; }
    .btn-danger { background: #b91c1c; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .results-box { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #cbd5e1; overflow-x: auto; max-height: 380px; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric-card { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
    .metric-title { font-size: 11px; text-transform: uppercase; color: var(--muted); }
    .metric-val { font-size: 18px; font-weight: 700; color: #fff; margin-top: 4px; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .pill-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .pill-yellow { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .pill-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .pill-red { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .footer { text-align: center; margin-top: 40px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 20px; }
    .steps-list { list-style: none; }
    .steps-list li { padding: 10px; border-left: 2px solid var(--border); margin-bottom: 8px; background: rgba(255,255,255,0.02); border-radius: 0 6px 6px 0; }
    .steps-list li.passed { border-left-color: var(--success); }
    .steps-list li.rejected { border-left-color: var(--danger); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">T</div>
        <div>
          <h1>Toka SDK</h1>
          <p class="tagline">Cost-control & observability architecture for LLM applications</p>
        </div>
      </div>
      <div class="status-badge">
        <span class="status-dot"></span> Server Active :3000
      </div>
    </header>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('budgets')">Budget Engine (Phase 3)</button>
      <button class="tab-btn" onclick="switchTab('estimator')">Cost Estimator</button>
      <button class="tab-btn" onclick="switchTab('fallback')">Model Fallback</button>
      <button class="tab-btn" onclick="switchTab('cache')">Cache & Latency</button>
      <button class="tab-btn" onclick="switchTab('completion')">Live SDK Request</button>
      <button class="tab-btn" onclick="switchTab('pricing')">Pricing Registry</button>
    </div>

    <!-- TAB: Budget Engine (Phase 3) -->
    <div id="tab-budgets" class="tab-content active">
      <div class="grid">
        <div class="card">
          <h2>Budget Policies & Context</h2>
          <label>Model</label>
          <select id="bg-model">
            <option value="gpt-4o-mini">gpt-4o-mini ($0.15 / $0.60 per 1M)</option>
            <option value="gpt-4o">gpt-4o ($2.50 / $10.00 per 1M)</option>
            <option value="gpt-4.1">gpt-4.1 ($2.00 / $8.00 per 1M)</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo ($0.50 / $1.50 per 1M)</option>
          </select>

          <label>Prompt</label>
          <textarea id="bg-prompt">Explain the Toka multi-scope cost control policy engine and how pre-request reservation prevents concurrent budget exhaustion.</textarea>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label>Per-Request ($)</label>
              <input type="number" id="bg-per-req" value="0.05" step="0.01">
            </div>
            <div>
              <label>Per-Task ($)</label>
              <input type="number" id="bg-per-task" value="0.10" step="0.01">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label>Per-Session ($)</label>
              <input type="number" id="bg-per-sess" value="0.25" step="0.05">
            </div>
            <div>
              <label>Per-Day ($)</label>
              <input type="number" id="bg-per-day" value="5.00" step="1.0">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label>Default Action</label>
              <select id="bg-action">
                <option value="block">block</option>
                <option value="warn">warn</option>
                <option value="fallback">fallback</option>
              </select>
            </div>
            <div>
              <label>Approval Threshold ($)</label>
              <input type="number" id="bg-approval" value="0.04" step="0.01">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div>
              <label>Task ID</label>
              <input type="text" id="bg-task-id" value="task-alpha">
            </div>
            <div>
              <label>Session ID</label>
              <input type="text" id="bg-session-id" value="sess-001">
            </div>
          </div>

          <label style="display: flex; align-items: center; gap: 8px; text-transform: none; cursor: pointer; margin-bottom: 16px;">
            <input type="checkbox" id="bg-approved" style="width: auto; margin-bottom: 0;"> Explicit Approval Granted (for expensive requests)
          </label>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn" onclick="evaluateBudget()">Evaluate Pre-Check</button>
            <button class="btn btn-secondary" onclick="executeBudgetRequest()">Execute Request</button>
            <button class="btn btn-secondary" onclick="inspectBudgetStatus()">Inspect Status</button>
            <button class="btn btn-danger" onclick="resetBudgets()">Reset All</button>
          </div>
        </div>

        <div class="card">
          <h2>Budget Decision & Status</h2>
          <div class="metric-grid">
            <div class="metric-card">
              <div class="metric-title">Decision Action</div>
              <div class="metric-val" id="bg-res-action">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Estimated Cost</div>
              <div class="metric-val" id="bg-res-cost" style="color: #60a5fa;">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Remaining Cap</div>
              <div class="metric-val" id="bg-res-remaining">-</div>
            </div>
          </div>

          <label>Scope Accounting Table</label>
          <div style="overflow-x: auto; margin-bottom: 14px;">
            <table>
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Limit</th>
                  <th>Spent</th>
                  <th>Remaining</th>
                  <th>Action</th>
                  <th>Exceeded</th>
                </tr>
              </thead>
              <tbody id="bg-table-body">
                <tr><td colspan="6" style="color: var(--muted);">Click Evaluate or Inspect to load status.</td></tr>
              </tbody>
            </table>
          </div>

          <label>Raw Output</label>
          <div class="results-box" id="bg-json">// Output will appear here</div>
        </div>
      </div>
    </div>

    <!-- TAB 1: Cost Estimator -->
    <div id="tab-estimator" class="tab-content">
      <div class="grid">
        <div class="card">
          <h2>1. Input Prompt & Model</h2>
          <label>Model</label>
          <select id="est-model">
            <option value="gpt-4o-mini">gpt-4o-mini ($0.15 / $0.60 per 1M tokens)</option>
            <option value="gpt-4o">gpt-4o ($2.50 / $10.00 per 1M tokens)</option>
            <option value="gpt-4.1">gpt-4.1 ($2.00 / $8.00 per 1M tokens)</option>
            <option value="gpt-4.1-mini">gpt-4.1-mini ($0.40 / $1.60 per 1M tokens)</option>
            <option value="gpt-4.1-nano">gpt-4.1-nano ($0.10 / $0.40 per 1M tokens)</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo ($0.50 / $1.50 per 1M tokens)</option>
          </select>

          <label>Prompt Text</label>
          <textarea id="est-prompt">Summarize the main principles of high-performance LLM cache-key generation and token pricing controls for production applications.</textarea>

          <label>Estimated Output Tokens</label>
          <input type="number" id="est-output" value="150" min="1" max="4096">

          <button class="btn" onclick="runEstimate()">Calculate Toka Cost</button>
        </div>

        <div class="card">
          <h2>2. Toka Cost Breakdown</h2>
          <div class="metric-grid">
            <div class="metric-card">
              <div class="metric-title">Input Tokens</div>
              <div class="metric-val" id="est-res-in-tok">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Output Tokens</div>
              <div class="metric-val" id="est-res-out-tok">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Total Cost (USD)</div>
              <div class="metric-val" id="est-res-cost" style="color: #60a5fa;">-</div>
            </div>
          </div>
          <div class="results-box" id="est-json">// Click 'Calculate Toka Cost' to inspect exact breakdown</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: Model Fallback -->
    <div id="tab-fallback" class="tab-content">
      <div class="grid">
        <div class="card">
          <h2>Budget-Enforced Model Fallback</h2>
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 14px;">
            Toka automatically evaluates model costs against your <code>maxCostPerRequest</code> and falls back down the tier list to prevent budget overruns.
          </p>

          <label>Prompt</label>
          <textarea id="fb-prompt">Analyze customer sentiment across 500 support transcripts and generate a categorized action plan.</textarea>

          <label>Max Cost Budget Per Request (USD)</label>
          <input type="number" id="fb-budget" value="0.0001" step="0.00001" min="0.000001">

          <label>Model Preference Chain (Most capable first)</label>
          <input type="text" id="fb-chain" value="gpt-4o, gpt-4.1, gpt-4o-mini, gpt-4.1-nano">

          <button class="btn" onclick="runFallback()">Simulate Fallback Chain</button>
        </div>

        <div class="card">
          <h2>Evaluation Sequence</h2>
          <div id="fb-decision" style="margin-bottom: 16px;"></div>
          <ul class="steps-list" id="fb-steps">
            <li>Run simulation to see fallback resolution steps.</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 3: Cache & Latency -->
    <div id="tab-cache" class="tab-content">
      <div class="grid">
        <div class="card">
          <h2>In-Memory Caching Verification</h2>
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 14px;">
            Identical requests hashed via Toka's SHA-256 cache-key generation return instantly with <strong>0ms latency</strong> and <strong>$0 marginal cost</strong>.
          </p>

          <label>Model</label>
          <select id="cache-model">
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
          </select>

          <label>Cached Query</label>
          <input type="text" id="cache-prompt" value="What is the distance from the Earth to the Moon?">

          <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="testCache()">Send Request</button>
            <button class="btn btn-secondary" onclick="clearCache()">Clear Cache</button>
          </div>
        </div>

        <div class="card">
          <h2>Execution Log</h2>
          <div class="metric-grid">
            <div class="metric-card">
              <div class="metric-title">Cache Status</div>
              <div class="metric-val" id="cache-hit-status">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Latency</div>
              <div class="metric-val" id="cache-latency">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Cost Incurred</div>
              <div class="metric-val" id="cache-cost">-</div>
            </div>
          </div>
          <div class="results-box" id="cache-log">// Send a request twice to see the cache hit in action</div>
        </div>
      </div>
    </div>

    <!-- TAB 4: Live SDK Request -->
    <div id="tab-completion" class="tab-content">
      <div class="grid">
        <div class="card">
          <h2>Toka.complete() Request</h2>
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 14px;">
            Executes request using Toka's active provider (MockProvider or OpenAIProvider if configured).
          </p>

          <label>Model</label>
          <select id="live-model">
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
            <option value="gpt-4.1">gpt-4.1</option>
            <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
          </select>

          <label>Max Budget Cap (USD)</label>
          <input type="number" id="live-budget" value="1.0" step="0.1">

          <label>User Message</label>
          <textarea id="live-message">Explain the benefit of actual vs estimated token cost reporting in Toka.</textarea>

          <button class="btn" onclick="runComplete()">Execute Toka.complete()</button>
        </div>

        <div class="card">
          <h2>SDK Response & Metadata</h2>
          <div class="results-box" id="live-res" style="min-height: 220px;">// Response will appear here</div>
        </div>
      </div>
    </div>

    <!-- TAB 5: Pricing Registry -->
    <div id="tab-pricing" class="tab-content">
      <div class="card">
        <h2>OpenAI Standard Pricing Registry (USD per 1M Tokens)</h2>
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 14px;">
          Synchronized from <code>src/cost/pricing.ts</code> registry version 2026-09.
        </p>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Input / 1M Tokens</th>
                <th>Output / 1M Tokens</th>
                <th>Registry Version</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody id="pricing-table-body">
              <tr><td colspan="5">Loading registry...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <footer class="footer">
      <p>Toka SDK 1.3.0 &bull; Running on Node.js 22 &bull; Port 3000</p>
    </footer>
  </div>

  <script>
    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(name));
      if (activeBtn) activeBtn.classList.add('active');
      const target = document.getElementById('tab-' + name);
      if (target) target.classList.add('active');
    }

    function getBudgetPayload() {
      return {
        model: document.getElementById('bg-model').value,
        message: document.getElementById('bg-prompt').value,
        budgets: {
          perRequest: parseFloat(document.getElementById('bg-per-req').value) || undefined,
          perTask: parseFloat(document.getElementById('bg-per-task').value) || undefined,
          perSession: parseFloat(document.getElementById('bg-per-sess').value) || undefined,
          perDay: parseFloat(document.getElementById('bg-per-day').value) || undefined,
          action: document.getElementById('bg-action').value,
          approvalRequiredAbove: parseFloat(document.getElementById('bg-approval').value) || undefined,
        },
        budgetContext: {
          taskId: document.getElementById('bg-task-id').value.trim() || undefined,
          sessionId: document.getElementById('bg-session-id').value.trim() || undefined,
          approved: document.getElementById('bg-approved').checked,
        }
      };
    }

    function renderBudgetTable(limits) {
      const tbody = document.getElementById('bg-table-body');
      if (!limits || Object.keys(limits).length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color: var(--muted);">No active scope limits.</td></tr>';
        return;
      }
      tbody.innerHTML = Object.entries(limits).map(([scope, data]) => {
        const cls = data.exceeded ? 'pill pill-red' : 'pill pill-green';
        return '<tr>' +
          '<td><strong>' + scope + '</strong></td>' +
          '<td>$' + (data.limit != null ? data.limit.toFixed(4) : '-') + '</td>' +
          '<td>$' + (data.spent != null ? data.spent.toFixed(4) : '-') + '</td>' +
          '<td>$' + (data.remaining != null ? data.remaining.toFixed(4) : '-') + '</td>' +
          '<td><span class="pill pill-blue">' + (data.action || 'block') + '</span></td>' +
          '<td><span class="' + cls + '">' + (data.exceeded ? 'YES' : 'NO') + '</span></td>' +
          '</tr>';
      }).join('');
    }

    async function evaluateBudget() {
      const payload = getBudgetPayload();
      document.getElementById('bg-json').innerText = 'Evaluating budget limits...';
      try {
        const res = await fetch('/api/budget/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        document.getElementById('bg-json').innerText = JSON.stringify(data, null, 2);

        const actionEl = document.getElementById('bg-res-action');
        if (data.allowed) {
          actionEl.innerHTML = '<span class="pill pill-green">' + data.action.toUpperCase() + '</span>';
        } else if (data.action === 'approval_required') {
          actionEl.innerHTML = '<span class="pill pill-yellow">APPROVAL REQUIRED</span>';
        } else {
          actionEl.innerHTML = '<span class="pill pill-red">' + (data.action || 'BLOCKED').toUpperCase() + '</span>';
        }

        document.getElementById('bg-res-cost').innerText = '$' + (data.estimatedCost ? data.estimatedCost.toFixed(6) : '0.000000');
        document.getElementById('bg-res-remaining').innerText = '$' + (data.remaining != null ? data.remaining.toFixed(6) : '-');

        const limitMap = {};
        if (Array.isArray(data.limits)) {
          data.limits.forEach(l => { limitMap[l.scope] = l; });
        }
        renderBudgetTable(limitMap);
      } catch (err) {
        document.getElementById('bg-json').innerText = 'Error: ' + err.message;
      }
    }

    async function executeBudgetRequest() {
      const payload = getBudgetPayload();
      document.getElementById('bg-json').innerText = 'Executing request with cost engine...';
      try {
        const res = await fetch('/api/budget/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        document.getElementById('bg-json').innerText = JSON.stringify(data, null, 2);

        if (res.ok) {
          document.getElementById('bg-res-action').innerHTML = '<span class="pill pill-green">SUCCESS</span>';
          document.getElementById('bg-res-cost').innerText = '$' + (data.cost ? data.cost.toFixed(6) : '0.000000');
          inspectBudgetStatus();
        } else {
          document.getElementById('bg-res-action').innerHTML = '<span class="pill pill-red">' + (data.action || 'BLOCKED').toUpperCase() + '</span>';
          document.getElementById('bg-res-cost').innerText = '$' + (data.requestedCost ? data.requestedCost.toFixed(6) : '-');
        }
      } catch (err) {
        document.getElementById('bg-json').innerText = 'Error: ' + err.message;
      }
    }

    async function inspectBudgetStatus() {
      const payload = getBudgetPayload();
      try {
        const res = await fetch('/api/budget/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        renderBudgetTable(data.limits);
      } catch (err) {
        console.error('Failed to inspect status', err);
      }
    }

    async function resetBudgets() {
      await fetch('/api/budget/reset', { method: 'POST' });
      document.getElementById('bg-json').innerText = '// All budget counters reset to 0.';
      inspectBudgetStatus();
    }

    async function runEstimate() {
      const model = document.getElementById('est-model').value;
      const prompt = document.getElementById('est-prompt').value;
      const outputTokens = parseInt(document.getElementById('est-output').value, 10) || 100;
      try {
        const res = await fetch('/api/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, expectedOutputTokens: outputTokens })
        });
        const data = await res.json();
        document.getElementById('est-res-in-tok').innerText = data.inputTokens;
        document.getElementById('est-res-out-tok').innerText = data.outputTokens;
        document.getElementById('est-res-cost').innerText = '$' + data.breakdown.cost.toFixed(6);
        document.getElementById('est-json').innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('est-json').innerText = 'Error: ' + err.message;
      }
    }

    async function runFallback() {
      const prompt = document.getElementById('fb-prompt').value;
      const maxCost = parseFloat(document.getElementById('fb-budget').value) || 0.0001;
      const chainStr = document.getElementById('fb-chain').value;
      const modelList = chainStr.split(',').map(s => s.trim()).filter(Boolean);

      try {
        const res = await fetch('/api/fallback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, maxCostPerRequest: maxCost, modelList })
        });
        const data = await res.json();

        const dec = document.getElementById('fb-decision');
        if (data.selectedModel) {
          dec.innerHTML = '<span class="pill pill-green">SUCCESS: Selected ' + data.selectedModel + '</span> within budget $' + maxCost;
        } else {
          dec.innerHTML = '<span class="pill pill-yellow">BUDGET EXCEEDED: No model fits within $' + maxCost + '</span>';
        }

        const stepsUl = document.getElementById('fb-steps');
        stepsUl.innerHTML = data.evaluationSteps.map(s => {
          const cls = s.fitsBudget ? 'passed' : 'rejected';
          const icon = s.fitsBudget ? '✓' : '✗';
          return '<li class="' + cls + '"><strong>' + icon + ' ' + s.model + '</strong>: Estimated cost $' + s.estimatedCost.toFixed(6) + ' (Budget: $' + maxCost + ') - ' + (s.fitsBudget ? 'ACCEPTED' : 'FALLBACK TRIGGERED') + '</li>';
        }).join('');
      } catch (err) {
        document.getElementById('fb-decision').innerText = 'Error: ' + err.message;
      }
    }

    async function testCache() {
      const model = document.getElementById('cache-model').value;
      const prompt = document.getElementById('cache-prompt').value;
      try {
        const start = performance.now();
        const res = await fetch('/api/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, message: prompt, useCache: true })
        });
        const elapsed = Math.round(performance.now() - start);
        const data = await res.json();

        const isHit = !!data.cacheHit;
        document.getElementById('cache-hit-status').innerHTML = isHit 
          ? '<span style="color: #34d399;">HIT (Cached)</span>' 
          : '<span style="color: #fbbf24;">MISS (Computed)</span>';
        document.getElementById('cache-latency').innerText = (isHit ? data.latencyMs : elapsed) + ' ms';
        document.getElementById('cache-cost').innerText = '$' + (data.cost ? data.cost.toFixed(6) : '0.000000');
        document.getElementById('cache-log').innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('cache-log').innerText = 'Error: ' + err.message;
      }
    }

    async function clearCache() {
      await fetch('/api/cache/clear', { method: 'POST' });
      document.getElementById('cache-hit-status').innerText = 'CLEARED';
      document.getElementById('cache-log').innerText = '// Memory cache cleared.';
    }

    async function runComplete() {
      const model = document.getElementById('live-model').value;
      const message = document.getElementById('live-message').value;
      const budget = parseFloat(document.getElementById('live-budget').value) || 1.0;
      document.getElementById('live-res').innerText = 'Executing request...';
      try {
        const res = await fetch('/api/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, message, maxCostPerRequest: budget, useCache: false })
        });
        const data = await res.json();
        document.getElementById('live-res').innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('live-res').innerText = 'Error: ' + err.message;
      }
    }

    async function loadPricing() {
      try {
        const res = await fetch('/api/pricing');
        const list = await res.json();
        const tbody = document.getElementById('pricing-table-body');
        tbody.innerHTML = list.map(p => '<tr>' +
          '<td><strong>' + p.model + '</strong></td>' +
          '<td>$' + p.inputPricePerMillionTokens.toFixed(2) + '</td>' +
          '<td>$' + p.outputPricePerMillionTokens.toFixed(2) + '</td>' +
          '<td>' + (p.version || '2026-09') + '</td>' +
          '<td>' + p.currency + '</td>' +
          '</tr>'
        ).join('');
      } catch (err) {
        console.error('Failed to load pricing', err);
      }
    }

    loadPricing();
    runEstimate();
    evaluateBudget();
  </script>
</body>
</html>`;
}

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const parsedUrl = new URL(
    req.url || '/',
    `http://${req.headers.host || 'localhost'}`
  );
  const pathname = parsedUrl.pathname;
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-provider',
    });
    res.end();
    return;
  }

  // UI Route
  if (pathname === '/' || pathname === '/index.html') {
    const html = getIndexHtml();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
    });
    res.end(html);
    return;
  }

  // Healthcheck endpoint
  if (pathname === '/api/health' && method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'toka-sdk',
      version: '1.3.0',
      phase: 3,
      uptimeSec: Math.floor(process.uptime()),
      port: PORT,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Pricing registry endpoint
  if (pathname === '/api/pricing' && method === 'GET') {
    const pricingList = Array.from(defaultPricingRegistry.values());
    sendJson(res, 200, pricingList);
    return;
  }

  // Models endpoint
  if (pathname === '/api/models' && method === 'GET') {
    sendJson(res, 200, {
      supportedModels,
      pricing: Array.from(defaultPricingRegistry.values()),
    });
    return;
  }

  // Phase 3 Budget Evaluate Endpoint
  if (pathname === '/api/budget/evaluate' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const model = typeof body.model === 'string' ? body.model : 'gpt-4o-mini';
      const message =
        typeof body.message === 'string' ? body.message : 'Hello from Toka';
      const budgets =
        (body.budgets as BudgetPolicy | undefined) ?? { perRequest: 1.0 };
      const budgetContext = body.budgetContext as BudgetContext | undefined;

      const provider = getProvider();
      const toka = new Toka(
        {
          models: supportedModels,
          budgets,
        },
        undefined,
        provider,
        sharedBudgetStore
      );

      const decision = await toka.evaluateBudget({
        model,
        messages: [{ role: 'user', content: message }],
        budgetContext,
      });

      sendJson(res, 200, decision);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Evaluation failed';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  // Phase 3 Budget Complete Endpoint
  if (pathname === '/api/budget/complete' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const model = typeof body.model === 'string' ? body.model : 'gpt-4o-mini';
      const message =
        typeof body.message === 'string' ? body.message : 'Hello from Toka';
      const budgets =
        (body.budgets as BudgetPolicy | undefined) ?? { perRequest: 1.0 };
      const budgetContext = body.budgetContext as BudgetContext | undefined;

      const apiKey =
        typeof body.apiKey === 'string'
          ? body.apiKey
          : (req.headers['x-api-key'] as string | undefined);
      const providerName =
        typeof body.provider === 'string'
          ? body.provider
          : (req.headers['x-provider'] as string | undefined);

      const provider = getProvider({ apiKey, provider: providerName });
      const toka = new Toka(
        {
          models: supportedModels,
          budgets,
        },
        sharedCache,
        provider,
        sharedBudgetStore
      );

      const response = await toka.complete({
        model,
        messages: [{ role: 'user', content: message }],
        budgetContext,
      });

      sendJson(res, 200, response);
    } catch (err) {
      if (err instanceof TokaBudgetExceededError) {
        sendJson(res, 429, {
          error: err.message,
          code: err.code,
          scope: err.scope,
          limit: err.limit,
          spent: err.spent,
          remaining: err.remaining,
          requestedCost: err.requestedCost,
          action: err.action,
          decision: err.decision,
        });
        return;
      }
      const statusCode = err instanceof TokaError ? 400 : 500;
      const message =
        err instanceof Error ? err.message : 'Execution failed';
      sendJson(res, statusCode, { error: message });
    }
    return;
  }

  // Phase 3 Budget Status Endpoint
  if (pathname === '/api/budget/status' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const budgets =
        (body.budgets as BudgetPolicy | undefined) ?? { perRequest: 1.0 };
      const budgetContext = body.budgetContext as BudgetContext | undefined;

      const provider = getProvider();
      const toka = new Toka(
        {
          models: supportedModels,
          budgets,
        },
        undefined,
        provider,
        sharedBudgetStore
      );

      const status = await toka.getBudgetStatus(budgetContext);
      sendJson(res, 200, status);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Status inspection failed';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  // Phase 3 Budget Reset Endpoint
  if (pathname === '/api/budget/reset' && method === 'POST') {
    await sharedBudgetStore.reset();
    sendJson(res, 200, {
      success: true,
      message: 'All budget spending counters reset to 0.',
    });
    return;
  }

  // Estimate endpoint
  if (pathname === '/api/estimate' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const model = typeof body.model === 'string' ? body.model : 'gpt-4o-mini';
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const expectedOutputTokens =
        typeof body.expectedOutputTokens === 'number'
          ? body.expectedOutputTokens
          : 100;

      const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
      const pricing = getPricing('openai', model);
      const breakdown = calculateCost(
        pricing,
        inputTokens,
        expectedOutputTokens,
        'estimated'
      );
      const heuristic = estimateCost(prompt, model);

      sendJson(res, 200, {
        model,
        inputTokens,
        outputTokens: expectedOutputTokens,
        pricing,
        breakdown,
        legacyHeuristic: heuristic,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Estimation failed';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  // Fallback simulation endpoint
  if (pathname === '/api/fallback' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const prompt = typeof body.prompt === 'string' ? body.prompt : '';
      const maxCostPerRequest =
        typeof body.maxCostPerRequest === 'number'
          ? body.maxCostPerRequest
          : 0.001;
      const modelList = Array.isArray(body.modelList)
        ? (body.modelList as string[])
        : ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4.1-nano'];

      const evaluationSteps: Array<{
        model: string;
        estimatedCost: number;
        fitsBudget: boolean;
      }> = [];

      let selectedModel: string | null = null;
      let currentModel: string | null = modelList[0];

      while (currentModel) {
        const est = estimateCost(prompt, currentModel);
        const fits = est.cost <= maxCostPerRequest;
        evaluationSteps.push({
          model: currentModel,
          estimatedCost: est.cost,
          fitsBudget: fits,
        });

        if (fits) {
          selectedModel = currentModel;
          break;
        }
        currentModel = getNextModel(currentModel, modelList);
      }

      sendJson(res, 200, {
        promptLength: prompt.length,
        maxCostPerRequest,
        modelList,
        selectedModel,
        evaluationSteps,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Fallback calculation failed';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  // Live SDK Completion endpoint
  if (pathname === '/api/complete' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const model = typeof body.model === 'string' ? body.model : 'gpt-4o-mini';
      const message =
        typeof body.message === 'string' ? body.message : 'Hello from Toka';
      const maxCost =
        typeof body.maxCostPerRequest === 'number'
          ? body.maxCostPerRequest
          : 1.0;
      const useCache = body.useCache !== false;

      const apiKey =
        typeof body.apiKey === 'string'
          ? body.apiKey
          : (req.headers['x-api-key'] as string | undefined);
      const providerName =
        typeof body.provider === 'string'
          ? body.provider
          : (req.headers['x-provider'] as string | undefined);

      const provider = getProvider({ apiKey, provider: providerName });
      const toka = new Toka(
        {
          models: supportedModels,
          maxCostPerRequest: maxCost,
        },
        useCache ? sharedCache : undefined,
        provider,
        sharedBudgetStore
      );

      const response = await toka.complete({
        model,
        messages: [{ role: 'user', content: message }],
      });

      sendJson(res, 200, response);
    } catch (err) {
      const statusCode = err instanceof TokaError ? 400 : 500;
      const message = err instanceof Error ? err.message : 'Execution failed';
      sendJson(res, statusCode, { error: message });
    }
    return;
  }

  // Clear cache endpoint
  if (pathname === '/api/cache/clear' && method === 'POST') {
    await sharedCache.clear();
    sendJson(res, 200, { success: true, message: 'Cache cleared' });
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
}

export const server = http.createServer(handleRequest);

if (typeof require !== 'undefined' && require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[Toka Server] Running on http://${HOST}:${PORT}`);
  });
}

export { getIndexHtml };
export default server;
