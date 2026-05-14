/**
 * debug-api.mjs — Diagnostic script for Azure AI Foundry connectivity.
 *
 * Usage: node debug-api.mjs
 * Tests: agent fetch + chat/completions with the workspace API key.
 */
import 'dotenv/config';

const key     = process.env.AZURE_API_KEY;
const base    = process.env.FOUNDRY_ENDPOINT.replace(/\/$/, '');
const project = process.env.PROJECT_NAME;
const hdrs    = { 'api-key': key, 'Content-Type': 'application/json' };

// Test 1: Fetch HR-Agent definition
console.log('--- GET HR-Agent definition ---');
const r1 = await fetch(
  `${base}/api/projects/${project}/agents/HR-Agent?api-version=2025-05-15-preview`,
  { headers: hdrs }
);
const agentDef = await r1.json();
console.log(r1.status, `instructions length: ${(agentDef.instructions || '').length}`);

// Test 2: chat/completions
console.log('\n--- POST chat/completions ---');
const r2 = await fetch(
  `${base}/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview`,
  {
    method: 'POST',
    headers: hdrs,
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a helpful HR assistant.' },
        { role: 'user',   content: 'What is the annual leave entitlement?' },
      ],
      max_tokens: 100,
    }),
  }
);
const chat = await r2.json();
console.log(r2.status, chat.choices?.[0]?.message?.content?.slice(0, 200));




