/**
 * Orchestration Patterns — Microsoft Agent Framework implementations.
 *
 * Three explicit patterns are provided:
 *
 *   1. HubAndSpoke   — Orchestrator routes to a single best specialist.
 *                      Default pattern; used when confidence is high and the
 *                      query falls within one domain.
 *
 *   2. FanOut        — All relevant specialists are queried in parallel.
 *                      The Orchestrator synthesises their responses into a
 *                      unified, source-attributed answer.  Triggered when
 *                      confidence < threshold or the query spans multiple domains.
 *
 *   3. Chain         — Sequential execution: Compliance Agent vets the query
 *                      first, then passes its context to the specialist agent.
 *                      Used for policy-sensitive or legally adjacent queries.
 *
 * Each pattern function accepts:
 *   @param {RoutingDecision} routing   - Output from router.routeQuery()
 *   @param {string[]}        messages  - Full conversation history (Responses API format)
 *   @param {Function}        callAgent - Async fn(appName, model, messages) → { message, citations }
 *
 * Each pattern returns:
 *   @returns {{ message, citations, agentsInvoked, patternUsed }}
 */

import { AGENT_REGISTRY, resolveAgent, findById } from './agentRegistry.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Resolves a Foundry agent entry from its agent-ID string, with env fallbacks. */
function resolveById(agentId) {
  const entry = findById(agentId);
  if (!entry) {
    // Return a safe default that will go to the Orchestrator
    return resolveAgent(AGENT_REGISTRY.orchestrator);
  }
  return resolveAgent(entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 1: Hub-and-Spoke
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Routes the conversation to a single specialist agent identified by the router.
 * The simplest and lowest-latency pattern.
 */
export async function hubAndSpoke(routing, messages, callAgent) {
  const agent = resolveById(routing.primaryAgent);

  const { message, citations } = await callAgent(agent.app, agent.model, messages);

  return {
    message,
    citations,
    agentsInvoked: [agent.id],
    patternUsed: 'hub-and-spoke',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 2: Fan-Out / Consensus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queries all relevant specialist agents in parallel, then uses the Orchestrator
 * to synthesise a unified, source-attributed response.
 *
 * Synthesis prompt instructs the Orchestrator to:
 *   - Acknowledge each agent's contribution
 *   - Resolve conflicts by deferring to the higher-priority domain
 *   - Return a single coherent answer
 */
export async function fanOut(routing, messages, callAgent) {
  const agentIds = [routing.primaryAgent, ...(routing.secondaryAgents || [])].filter(Boolean);

  // De-duplicate while preserving order
  const uniqueIds = [...new Set(agentIds)];
  const agents = uniqueIds.map(id => resolveById(id));

  // Parallel fan-out
  const results = await Promise.allSettled(
    agents.map(agent => callAgent(agent.app, agent.model, messages).then(r => ({ agent, ...r })))
  );

  const successfulResults = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failedAgents = results
    .filter(r => r.status === 'rejected')
    .map((_, i) => agents[i]?.id);

  if (failedAgents.length > 0) {
    console.warn('[FanOut] Some agents failed:', failedAgents);
  }

  if (successfulResults.length === 0) {
    throw new Error('All specialist agents failed in fan-out pattern.');
  }

  // Build synthesis prompt
  const agentResponses = successfulResults
    .map(r => `[${r.agent.displayName}]:\n${r.message}`)
    .join('\n\n---\n\n');

  const synthesisMessages = [
    ...messages,
    {
      role: 'assistant',
      content:
        `Multiple specialist agents have provided input on this query. ` +
        `Please synthesise their responses into a single coherent answer, ` +
        `clearly attributing each key point to its source agent. ` +
        `If agents contradict each other, note the discrepancy and explain which guidance takes precedence.\n\n` +
        agentResponses,
    },
    {
      role: 'user',
      content: 'Please provide the unified synthesised answer now.',
    },
  ];

  const orch = resolveAgent(AGENT_REGISTRY.orchestrator);
  const { message: synthesised, citations: synthCitations } = await callAgent(
    orch.app, orch.model, synthesisMessages
  );

  // Merge all citations
  const allCitations = successfulResults.flatMap(r => r.citations || []).concat(synthCitations || []);

  return {
    message: synthesised,
    citations: allCitations,
    agentsInvoked: successfulResults.map(r => r.agent.id),
    patternUsed: 'fan-out',
    agentResponses: successfulResults.map(r => ({
      agentId: r.agent.id,
      displayName: r.agent.displayName,
      message: r.message,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 3: Sequential Chain (Compliance → Specialist)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two-step sequential execution:
 *   Step 1 — Compliance Agent screens the query and produces a compliance context
 *             (applicable regulations, warnings, or a green-light).
 *   Step 2 — The downstream specialist agent receives the original query augmented
 *             with the compliance context so its answer is policy-aware.
 *
 * If the Compliance Agent signals a hard block (detects the word "BLOCKED" in its
 * response), execution stops and the compliance response is returned directly.
 */
export async function chain(routing, messages, callAgent) {
  const complianceAgent = resolveAgent(AGENT_REGISTRY.compliance);

  // Step 1: Compliance screening
  const compliancePrompt = [
    ...messages,
    {
      role: 'system',
      content:
        'You are acting as the compliance gatekeeper in a sequential orchestration chain. ' +
        'First, assess whether this query has any compliance, legal, or regulatory implications. ' +
        'If the query is entirely benign, respond with: "COMPLIANCE OK — [brief note]". ' +
        'If there are compliance considerations, explain them clearly. ' +
        'If the query requests something that violates policy, respond with: "BLOCKED — [reason]".',
    },
  ];

  const { message: complianceResponse, citations: complianceCitations } =
    await callAgent(complianceAgent.app, complianceAgent.model, compliancePrompt);

  // Hard block: return compliance decision without proceeding
  if (/^BLOCKED\s*[—–-]/i.test(complianceResponse.trim())) {
    return {
      message: complianceResponse,
      citations: complianceCitations,
      agentsInvoked: [complianceAgent.id],
      patternUsed: 'chain',
      chainStep: 'blocked-at-compliance',
    };
  }

  // Step 2: Specialist agent with compliance context injected
  const specialistId = routing.secondaryAgents?.[0] || routing.primaryAgent;
  const specialistAgent = resolveById(
    specialistId === complianceAgent.id ? routing.primaryAgent : specialistId
  );

  const specialistMessages = [
    ...messages,
    {
      role: 'system',
      content:
        `The following compliance assessment was produced for this query before reaching you:\n\n` +
        `"${complianceResponse}"\n\n` +
        `Take this compliance context into account when formulating your response. ` +
        `Ensure your answer aligns with the stated compliance guidance.`,
    },
  ];

  const { message: specialistResponse, citations: specialistCitations } =
    await callAgent(specialistAgent.app, specialistAgent.model, specialistMessages);

  return {
    message: specialistResponse,
    citations: [...(complianceCitations || []), ...(specialistCitations || [])],
    agentsInvoked: [complianceAgent.id, specialistAgent.id],
    patternUsed: 'chain',
    chainStep: 'completed',
    complianceContext: complianceResponse,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Selects and executes the appropriate pattern based on the routing decision
 * and an optional user-supplied hint.
 *
 * @param {string}          patternHint  - 'auto' | 'hub-and-spoke' | 'fan-out' | 'chain'
 * @param {RoutingDecision} routing
 * @param {string[]}        messages
 * @param {Function}        callAgent
 * @param {number}          confidenceThreshold  - 0–1; below this triggers fan-out
 */
export async function executePattern(patternHint, routing, messages, callAgent, confidenceThreshold = 0.75) {
  // Honour explicit user hint (override AI decision)
  const effectivePattern =
    patternHint && patternHint !== 'auto' ? patternHint : routing.pattern;

  // Auto-elevate to fan-out if AI confidence is too low (unless chain was decided)
  const resolvedPattern =
    effectivePattern !== 'chain' && routing.confidence < confidenceThreshold
      ? 'fan-out'
      : effectivePattern;

  switch (resolvedPattern) {
    case 'chain':
      return chain(routing, messages, callAgent);
    case 'fan-out':
      return fanOut(routing, messages, callAgent);
    case 'hub-and-spoke':
    default:
      return hubAndSpoke(routing, messages, callAgent);
  }
}
