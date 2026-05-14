import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { CosmosClient } from '@azure/cosmos';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { orchestrate } from './orchestration/index.js';
import { AuditLog }   from './orchestration/trustLayer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Audit Log (trust layer) ────────────────────────────────────────────────
const auditLog = new AuditLog();

// ── Configuration ──────────────────────────────────────────────────────
const PORT             = process.env.PORT || 3000;
const FOUNDRY_ENDPOINT = process.env.FOUNDRY_ENDPOINT ? process.env.FOUNDRY_ENDPOINT.replace(/\/$/, '') : undefined;
const PROJECT_NAME     = process.env.PROJECT_NAME;
const AZURE_API_KEY    = process.env.AZURE_API_KEY;
const API_VERSION      = '2025-05-15-preview';   // Foundry agents management API
const CHAT_API_VERSION = '2025-01-01-preview';   // OpenAI chat/completions API

// ── Cosmos DB ticket store ─────────────────────────────────────────────
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY      = process.env.COSMOS_KEY;

let ticketsContainer = null;
let nextTicketId = 1000;

async function initCosmosDB() {
  if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
    console.warn('⚠ COSMOS_ENDPOINT/COSMOS_KEY not set — tickets stored in memory only');
    return;
  }
  try {
    const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    const { database } = await client.databases.createIfNotExists({ id: 'ticketsdb' });
    const { container } = await database.containers.createIfNotExists({
      id: 'tickets',
      partitionKey: { paths: ['/userId'] },
    });
    ticketsContainer = container;

    // Determine next ticket ID from highest existing
    const { resources } = await container.items
      .query('SELECT VALUE MAX(c.numericId) FROM c')
      .fetchAll();
    const maxId = resources[0];
    if (typeof maxId === 'number' && maxId >= nextTicketId) nextTicketId = maxId + 1;

    console.log(`✓ Cosmos DB connected — tickets container ready (next ID: IT-${nextTicketId})`);
  } catch (err) {
    console.warn(`⚠ Cosmos DB init failed: ${err.message} — using in-memory fallback`);
  }
}

// In-memory fallback when Cosmos is unavailable
const memTickets = [];

async function createTicket(ticket) {
  if (ticketsContainer) {
    const { resource } = await ticketsContainer.items.create(ticket);
    return resource;
  }
  memTickets.push(ticket);
  return ticket;
}

async function getTicketById(ticketId) {
  if (ticketsContainer) {
    const { resources } = await ticketsContainer.items
      .query(
        { query: 'SELECT * FROM c WHERE c.id = @id', parameters: [{ name: '@id', value: ticketId }] },
        { enableCrossPartitionQuery: true }
      )
      .fetchAll();
    return resources[0] || null;
  }
  return memTickets.find(t => t.id === ticketId) || null;
}

async function getTicketsByUser(userId) {
  if (ticketsContainer) {
    const { resources } = await ticketsContainer.items
      .query(
        { query: 'SELECT * FROM c WHERE c.userId = @uid', parameters: [{ name: '@uid', value: userId }] },
        { partitionKey: userId }
      )
      .fetchAll();
    return resources;
  }
  return memTickets.filter(t => t.userId === userId);
}

async function getAllTickets() {
  if (ticketsContainer) {
    try {
      // Primary: parameterised query with explicit cross-partition flag
      const { resources } = await ticketsContainer.items
        .query({ query: 'SELECT TOP 100 * FROM c ORDER BY c._ts DESC' }, { enableCrossPartitionQuery: true })
        .fetchAll();
      return resources;
    } catch (queryErr) {
      console.warn('[getAllTickets] Parameterised query failed, falling back to readAll:', queryErr.message);
      try {
        // Fallback: readAll (no query — works regardless of SDK cross-partition mode)
        const { resources } = await ticketsContainer.items.readAll({ enableCrossPartitionQuery: true }).fetchAll();
        return resources.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } catch (readErr) {
        console.error('[getAllTickets] readAll fallback also failed:', readErr.message);
        return [];
      }
    }
  }
  return [...memTickets].reverse();
}

async function updateTicketStatus(ticketId, status, resolution) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) return null;
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  if (resolution) ticket.resolution = resolution;
  if (ticketsContainer) {
    const { resource } = await ticketsContainer.items.upsert(ticket);
    return resource;
  }
  return ticket;
}

// ── Default system instructions per agent ──────────────────────────────
const DEFAULT_INSTRUCTIONS = {
  'Orchestrator-Agent':
    'You are the Orchestrator of a multi-agent enterprise AI system. Your role is to ' +
    'classify employee queries, coordinate specialist agents, and synthesize responses. ' +
    'Maintain professionalism, accuracy, and cite the contributing agent when combining answers.',
  'HR-Agent':
    'You are an HR specialist AI assistant. Answer questions about HR policies, employee ' +
    'benefits, leave entitlements (annual, sick, parental), flexible working arrangements, ' +
    'onboarding, compensation, performance reviews, and employee relations. ' +
    'Be precise, policy-aware, and direct employees to HR if case-specific guidance is needed.',
  'ITSupport-Agent':
    'You are an IT Support specialist AI assistant. Help employees with password resets, ' +
    'VPN access, laptop setup, network connectivity, software installation, hardware issues, ' +
    'account access, two-factor authentication, and general IT troubleshooting. ' +
    'Provide clear step-by-step guidance and escalate to the IT team for hardware replacements.',
  'Compliance-Agent':
    'You are a Compliance specialist AI assistant. Advise on GDPR, data protection, anti-bribery, ' +
    'SOC2, code of conduct, ethics policies, whistleblower procedures, sanctions, and regulatory ' +
    'requirements. Your role in the Sequential Chain is to screen queries for compliance risks ' +
    'before specialist agents respond. Flag potential violations clearly.',
};

// ── Cache: agent system instructions loaded at startup ─────────────────
const agentInstructions = {};

async function loadAgentInstructions() {
  if (!FOUNDRY_ENDPOINT || !PROJECT_NAME || !AZURE_API_KEY) return;

  const agentNames = [
    process.env.AGENT_APP_ORCHESTRATOR || 'Orchestrator-Agent',
    process.env.AGENT_APP_HR           || 'HR-Agent',
    process.env.AGENT_APP_IT           || 'ITSupport-Agent',
    process.env.AGENT_APP_COMPLIANCE   || 'Compliance-Agent',
  ];

  await Promise.all(agentNames.map(async (name) => {
    try {
      const res = await fetch(
        `${FOUNDRY_ENDPOINT}/api/projects/${PROJECT_NAME}/agents/${name}?api-version=${API_VERSION}`,
        { headers: { 'api-key': AZURE_API_KEY } }
      );
      if (res.ok) {
        const def = await res.json();
        const instructions = def.instructions || def.definition?.instructions || '';
        agentInstructions[name] = instructions.trim() || DEFAULT_INSTRUCTIONS[name] || '';
        console.log(`✓ Loaded instructions for ${name} (${agentInstructions[name].length} chars)`);
      } else {
        agentInstructions[name] = DEFAULT_INSTRUCTIONS[name] || '';
        console.warn(`⚠ Could not load ${name} (${res.status}) — using default instructions`);
      }
    } catch (err) {
      agentInstructions[name] = DEFAULT_INSTRUCTIONS[name] || '';
      console.warn(`⚠ Error loading ${name}: ${err.message} — using default instructions`);
    }
  }));
}

/**
 * Builds a ticket context string to inject into the IT agent's system prompt.
 * Handles: specific ticket IDs (IT-1234), "my ticket", status/resolution queries.
 */
async function buildTicketContext(userMessage) {
  const lines = [];

  try {
    // 1. Look for explicit ticket IDs like IT-1000, it-1001
    const ticketIdMatches = userMessage.match(/\bIT-\d+\b/gi) || [];
    for (const tid of ticketIdMatches) {
      const t = await getTicketById(tid.toUpperCase());
      if (t) {
        lines.push(
          `Ticket ${t.id} [${t.status}] — "${t.title}"` +
          ` | Priority: ${t.priority}` +
          ` | User: ${t.userId || t.user}` +
          ` | Created: ${t.createdAt?.slice(0, 10)}` +
          (t.resolution ? ` | Resolution: ${t.resolution}` : '')
        );
      }
    }

    // 2. General status/ticket questions — include recent tickets
    const statusIntent = /ticket|issue|problem|request|status|resolution|fix|solved|resolved|open|closed|progress/i;
    if (!lines.length && statusIntent.test(userMessage)) {
      const all = await getAllTickets();
      if (all.length) {
        all.slice(0, 10).forEach(t => {
          lines.push(
            `Ticket ${t.id} [${t.status}] — "${t.title}"` +
            ` | Priority: ${t.priority}` +
            ` | User: ${t.userId || t.user}` +
            ` | Created: ${t.createdAt?.slice(0, 10)}` +
            (t.resolution ? ` | Resolution: ${t.resolution}` : '')
          );
        });
      }
    }
  } catch (err) {
    console.error('[buildTicketContext] Error fetching tickets:', err.message);
  }

  if (!lines.length) return '';

  return (
    '\n\n--- TICKET CONTEXT (from Cosmos DB) ---\n' +
    lines.join('\n') +
    '\n--- END TICKET CONTEXT ---\n' +
    'Use this data to answer questions about ticket status, resolution, and progress.'
  );
}

/**
 * Core Foundry IQ caller — uses chat/completions with API key.
 * Accepts an optional extraSystemContext string that is appended to
 * the agent's system instructions (used for Cosmos ticket context injection).
 * NOTE: Context injection is intentionally NOT done here — callers must pass
 * it explicitly so routing calls are never polluted with ticket data.
 */
async function callFoundryAgent(appName, model, messages, extraSystemContext = '') {
  if (!FOUNDRY_ENDPOINT || !PROJECT_NAME || !AZURE_API_KEY) {
    throw new Error('Server misconfigured — FOUNDRY_ENDPOINT, PROJECT_NAME, and AZURE_API_KEY must be set in .env');
  }

  let systemInstructions = agentInstructions[appName] || DEFAULT_INSTRUCTIONS[appName] || '';
  if (extraSystemContext) {
    systemInstructions += extraSystemContext;
  }

  const chatMessages = systemInstructions
    ? [{ role: 'system', content: systemInstructions }, ...messages]
    : messages;

  const deploymentModel = model || 'gpt-4.1';
  const url = `${FOUNDRY_ENDPOINT}/openai/deployments/${deploymentModel}/chat/completions?api-version=${CHAT_API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': AZURE_API_KEY },
    body: JSON.stringify({ messages: chatMessages, temperature: 0.7, max_tokens: 1024 }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Foundry chat/completions ${response.status} for "${appName}": ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message?.content || 'No response from agent.';
  return { message, citations: [] };
}

/**
 * Orchestration-aware wrapper for callFoundryAgent.
 * Injects Cosmos DB ticket context ONLY when the resolved agent is the IT Support
 * specialist. Routing calls (which also use this callback) target the Orchestrator
 * app and receive no ticket context, keeping the routing JSON output clean.
 */
async function callFoundryAgentWithContext(appName, model, messages) {
  const itAppName = process.env.AGENT_APP_IT || 'ITSupport-Agent';
  let extraCtx = '';

  if (appName === itAppName) {
    // Extract the last user message — support both content and text fields
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      ? ([...messages].reverse().find(m => m.role === 'user').content ||
         [...messages].reverse().find(m => m.role === 'user').text || '')
      : '';

    const isTicketQuery = /\bIT-\d+\b|ticket|issue|problem|request|status|resolution|fix|solved|resolved|open|closed|progress|raised|support\s*case/i.test(lastUserMsg);
    if (isTicketQuery) {
      extraCtx = await buildTicketContext(lastUserMsg);
      if (extraCtx) {
        console.log(`[${appName}] Injected Cosmos ticket context (${extraCtx.length} chars)`);
      }
    }
  }

  return callFoundryAgent(appName, model, messages, extraCtx);
}

// ── POST /api/chat ─────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, patternHint = 'auto' } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!FOUNDRY_ENDPOINT || !PROJECT_NAME || !AZURE_API_KEY) {
      return res.status(500).json({
        error: 'Server misconfigured — FOUNDRY_ENDPOINT, PROJECT_NAME, and AZURE_API_KEY must be set in .env'
      });
    }

    const result = await orchestrate(messages, patternHint, callFoundryAgentWithContext, auditLog);

    return res.json({
      message:             result.message,
      citations:           result.citations,
      resolvedAgentId:     result.resolvedAgentId,
      orchestrationTrace:  result.orchestrationTrace,
    });
  } catch (err) {
    console.error('Orchestration error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── IT Support Ticket API ──────────────────────────────────────────────

// Create a new ticket — restricted to ITSupport-Agent only.
// The client must pass agentId: 'ITSupport-Agent' (or the resolved agent must be IT).
app.post('/api/tickets', async (req, res) => {
  const { title, description, user, priority, category, agentId } = req.body;

  // Gate: only ITSupport-Agent is permitted to create tickets
  const itAgentId = process.env.AGENT_APP_IT || 'ITSupport-Agent';
  if (agentId && agentId !== itAgentId && agentId !== 'ITSupport-Agent') {
    return res.status(403).json({
      error: `Ticket creation is restricted to the ITSupport-Agent. Received: "${agentId}".`
    });
  }

  if (!title || !description || !user || !priority) {
    return res.status(400).json({ error: 'title, description, user, and priority are required' });
  }

  const newTicket = {
    id: `IT-${nextTicketId++}`,
    numericId: nextTicketId - 1,
    title,
    description,
    userId: user,
    user,
    priority: priority || 'Medium',
    category: category || 'General',
    status: 'Open',
    createdAt: new Date().toISOString(),
  };

  try {
    const saved = await createTicket(newTicket);
    console.log(`🎫 Ticket created: ${saved.id} — "${saved.title}" [${saved.priority}]`);
    return res.status(201).json(saved);
  } catch (err) {
    console.error('Ticket create error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Get all tickets
app.get('/api/tickets', async (_req, res) => {
  try {
    return res.json(await getAllTickets());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get ticket by ID
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id.toUpperCase());
    if (!ticket) return res.status(404).json({ error: `Ticket ${req.params.id} not found` });
    return res.json(ticket);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Update ticket status / resolution
app.patch('/api/tickets/:id', async (req, res) => {
  const { status, resolution } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    const updated = await updateTicketStatus(req.params.id.toUpperCase(), status, resolution);
    if (!updated) return res.status(404).json({ error: `Ticket ${req.params.id} not found` });
    console.log(`🔄 Ticket ${updated.id} updated to [${updated.status}]`);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Cosmos DB Diagnostics ──────────────────────────────────────────────
app.get('/api/debug/cosmos', async (_req, res) => {
  const result = {
    configured: !!(COSMOS_ENDPOINT && COSMOS_KEY),
    endpoint: COSMOS_ENDPOINT || 'not set',
    containerReady: !!ticketsContainer,
    store: ticketsContainer ? 'cosmos-db' : 'in-memory',
    readTest: null,
    writeReadTest: null,
    error: null,
  };

  if (!ticketsContainer) {
    result.error = 'ticketsContainer is null — Cosmos init failed or credentials not set';
    return res.json(result);
  }

  // Read test — fetch a count of all documents
  try {
    const { resources: countRes } = await ticketsContainer.items
      .query({ query: 'SELECT VALUE COUNT(1) FROM c' }, { enableCrossPartitionQuery: true })
      .fetchAll();
    result.readTest = { success: true, documentCount: countRes[0] ?? 0 };
  } catch (err) {
    result.readTest = { success: false, error: err.message };
    result.error = `Read failed: ${err.message}`;
  }

  // Fallback read test using readAll
  if (!result.readTest?.success) {
    try {
      const { resources } = await ticketsContainer.items
        .readAll({ enableCrossPartitionQuery: true })
        .fetchAll();
      result.readTest = { success: true, method: 'readAll', documentCount: resources.length };
      result.error = null;
    } catch (err2) {
      result.readTest = { success: false, error: err2.message, method: 'readAll-fallback' };
    }
  }

  return res.json(result);
});

// ── Audit / Trust Layer API ────────────────────────────────────────────
app.get('/api/audit', (req, res) => {
  const n = Math.min(parseInt(req.query.n || '20', 10), 200);
  return res.json({ entries: auditLog.recent(n), total: auditLog.size });
});

// ── Health check ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    configured: !!(FOUNDRY_ENDPOINT && PROJECT_NAME && AZURE_API_KEY),
    endpoint: FOUNDRY_ENDPOINT ? `${FOUNDRY_ENDPOINT} (connected)` : 'not set',
    instructionsLoaded: Object.keys(agentInstructions).length,
    ticketStore: ticketsContainer ? 'cosmos-db' : 'in-memory',
  });
});

// ── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────
await Promise.all([initCosmosDB(), loadAgentInstructions()]);

app.listen(PORT, () => {
  console.log(`\n🚀 Foundry IQ Agent App running at  http://localhost:${PORT}`);
  console.log(`   Foundry endpoint:  ${FOUNDRY_ENDPOINT || '⚠  NOT SET'}`);
  console.log(`   Project:           ${PROJECT_NAME || '⚠  NOT SET'}`);
  console.log(`   API Key:           ${AZURE_API_KEY ? '✓ set' : '⚠  NOT SET'}`);
  console.log(`   Ticket store:      ${ticketsContainer ? 'Cosmos DB ✓' : 'in-memory (no Cosmos config)'}`);
  console.log(`   Orchestrator:      ${process.env.AGENT_APP_ORCHESTRATOR || '⚠  NOT SET'}`);
  console.log(`   HR Agent:          ${process.env.AGENT_APP_HR || '⚠  NOT SET'}`);
  console.log(`   IT Agent:          ${process.env.AGENT_APP_IT || '⚠  NOT SET'}`);
  console.log(`   Compliance Agent:  ${process.env.AGENT_APP_COMPLIANCE || '⚠  NOT SET'}\n`);
});


