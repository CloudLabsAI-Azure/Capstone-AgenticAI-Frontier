/**
 * AI-Powered Intent Router — Microsoft Foundry IQ Intelligence Layer.
 *
 * Uses the Foundry IQ Orchestrator application to classify user intent and
 * determine the optimal routing decision.  The router returns:
 *   - Which agent(s) should handle the query
 *   - A confidence score (0–100)
 *   - A human-readable reasoning string
 *   - A recommended orchestration pattern
 *
 * If the Foundry IQ call fails for any reason (network, config, quota) the
 * router transparently falls back to lightweight keyword-based routing so the
 * system remains available.  All fallback invocations are flagged in the audit
 * entry.
 */

import { AGENT_REGISTRY, getSpecialists, resolveAgent } from './agentRegistry.js';

// ── Routing system prompt ─────────────────────────────────────────────────────

function buildRoutingSystemPrompt(specialists) {
  const agentDescriptions = specialists
    .map(a => `- ${a.id}: ${a.description}`)
    .join('\n');

  return `You are an intelligent routing engine for a multi-agent enterprise assistant
powered by Microsoft Foundry IQ.  Your sole task is to analyse the user's latest
message and return a JSON routing decision.

Available specialist agents:
${agentDescriptions}

Respond ONLY with a valid JSON object matching this exact schema (no markdown fences):
{
  "primaryAgent": "<agent-id>",
  "secondaryAgents": ["<agent-id>", ...],
  "confidence": <0.0–1.0>,
  "pattern": "hub-and-spoke" | "fan-out" | "chain",
  "reasoning": "<one sentence>"
}

Pattern selection rules:
- "hub-and-spoke": Single best agent; confidence ≥ 0.75 and only one domain matches.
- "fan-out": Query spans multiple domains OR confidence < 0.75; include all relevant agents.
- "chain": Query requires compliance vetting first (involves policy, legal, regulation,
  data handling); primaryAgent must be "Compliance-Agent", secondaryAgents contains the
  specialist that answers AFTER compliance context is established.

Always set secondaryAgents to [] when pattern is "hub-and-spoke".
Always include "Compliance-Agent" as primaryAgent when pattern is "chain".`;
}

// ── Keyword fallback ──────────────────────────────────────────────────────────

const KEYWORD_RULES = [
  {
    pattern: /\b(leave|holiday|salary|onboarding|health.?insurance|parental|sick.?leave|flexible.?work|remote.?work|work.?hours|benefits|pay|payroll|performance|recruitment|resignation|termination|probation)\b/i,
    agentId: 'HR-Agent',
  },
  {
    pattern: /\b(password|internet|vpn|laptop|network|software|hardware|login|access|wifi|computer|monitor|mouse|keyboard|printer|email|two.?factor|2fa|remote.?desktop|installation|driver|reboot|crash|blue.?screen)\b/i,
    agentId: 'ITSupport-Agent',
  },
  {
    pattern: /\b(compliance|corruption|bribery|dpo|anti.?bribery|audit|gdpr|regulation|legal|risk|privacy|governance|soc2|data.?protection|whistleblower|ethics|code.?of.?conduct|sanctions|due.?diligence)\b/i,
    agentId: 'Compliance-Agent',
  },
];

function keywordFallback(userText) {
  const matches = KEYWORD_RULES.filter(r => r.pattern.test(userText));

  if (matches.length === 0) {
    return {
      primaryAgent: 'Orchestrator-Agent',
      secondaryAgents: [],
      confidence: 0.4,
      pattern: 'hub-and-spoke',
      reasoning: 'No domain keywords detected; routing to Orchestrator.',
      fallback: true,
    };
  }

  if (matches.length === 1) {
    return {
      primaryAgent: matches[0].agentId,
      secondaryAgents: [],
      confidence: 0.65,
      pattern: 'hub-and-spoke',
      reasoning: `Keyword match: routed to ${matches[0].agentId}.`,
      fallback: true,
    };
  }

  // Multiple keyword matches → fan-out
  return {
    primaryAgent: matches[0].agentId,
    secondaryAgents: matches.slice(1).map(m => m.agentId),
    confidence: 0.50,
    pattern: 'fan-out',
    reasoning: `Multiple domain keywords matched; fan-out across ${matches.map(m => m.agentId).join(', ')}.`,
    fallback: true,
  };
}

// ── AI Router ─────────────────────────────────────────────────────────────────

/**
 * Calls Foundry IQ Orchestrator with a routing-specific system prompt to
 * classify the user's intent.
 *
 * @param {string}   userQuery     - The user's latest message text.
 * @param {Function} foundryCall   - Async fn(appName, model, messages) → string.
 *                                   Injected by the orchestration engine so the
 *                                   router stays transport-agnostic.
 * @returns {Promise<RoutingDecision>}
 */
export async function routeQuery(userQuery, foundryCall) {
  const specialists = getSpecialists();
  const systemPrompt = buildRoutingSystemPrompt(specialists);

  const routingMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userQuery },
  ];

  const orch = resolveAgent(AGENT_REGISTRY.orchestrator);

  try {
    const rawResponse = await foundryCall(orch.app, orch.model, routingMessages);

    // Strip any accidental markdown fences the model may add
    const cleaned = rawResponse.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const decision = JSON.parse(cleaned);

    // Validate required fields
    if (!decision.primaryAgent || !decision.pattern || decision.confidence === undefined) {
      throw new Error('Incomplete routing decision from model');
    }

    return {
      primaryAgent: decision.primaryAgent,
      secondaryAgents: Array.isArray(decision.secondaryAgents) ? decision.secondaryAgents : [],
      confidence: parseFloat(decision.confidence),
      pattern: decision.pattern,
      reasoning: decision.reasoning || '',
      fallback: false,
    };
  } catch (err) {
    console.warn('[Router] AI routing failed, using keyword fallback:', err.message);
    return keywordFallback(userQuery);
  }
}
