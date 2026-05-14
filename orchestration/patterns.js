// ============================================================
// orchestration/patterns.js
// ============================================================
// Implements the three orchestration patterns:
//   1. Hub-and-Spoke — single best agent answers
//   2. Fan-Out       — parallel agents + synthesis
//   3. Chain         — compliance gate then specialist
// ============================================================

// TODO: Import AGENT_REGISTRY, resolveAgent, findById from ./agentRegistry.js

// Helper: resolve an agent entry by ID, falling back to orchestrator
function resolveById(agentId) {
  // TODO: Call findById(agentId), then resolveAgent on the result.
  //       If findById returns nothing, use AGENT_REGISTRY.orchestrator.
}

// ── Pattern 1: Hub-and-Spoke ─────────────────────────────────────────────────

// TODO: Export async function hubAndSpoke(routing, messages, callAgent)
//  1. Resolve the primary agent using resolveById(routing.primaryAgent).
//  2. Call callAgent(agent.app, agent.model, messages) → { message, citations }
//  3. Return { message, citations, agentsInvoked: [agent.id], patternUsed: 'hub-and-spoke' }
export async function hubAndSpoke(routing, messages, callAgent) {
  // TODO: implement
}

// ── Pattern 2: Fan-Out ───────────────────────────────────────────────────────

// TODO: Export async function fanOut(routing, messages, callAgent)
//  1. Collect unique agent IDs from [routing.primaryAgent, ...routing.secondaryAgents].
//  2. Call all agents IN PARALLEL using Promise.allSettled().
//  3. Filter for fulfilled results.
//  4. If none succeeded, throw an error.
//  5. Build a combined string of all agent responses.
//  6. Ask the Orchestrator to synthesise one coherent answer from the responses.
//  7. Return { message: synthesised, citations, agentsInvoked, patternUsed: 'fan-out', agentResponses }
export async function fanOut(routing, messages, callAgent) {
  // TODO: implement
}

// ── Pattern 3: Chain ─────────────────────────────────────────────────────────

// TODO: Export async function chain(routing, messages, callAgent)
//  1. Call the Compliance agent first with an extra system message asking it
//     to reply "COMPLIANCE OK — [note]", detailed findings, or "BLOCKED — [reason]".
//  2. If the response starts with "BLOCKED", return immediately with that message.
//  3. Otherwise call the specialist agent (routing.secondaryAgents[0] or primaryAgent)
//     with the compliance context injected as a system message.
//  4. Return { message, citations, agentsInvoked, patternUsed: 'chain',
//              chainStep: 'completed', complianceContext }
export async function chain(routing, messages, callAgent) {
  // TODO: implement
}

// ── Pattern dispatcher ────────────────────────────────────────────────────────

// TODO: Export async function executePattern(patternHint, routing, messages, callAgent, confidenceThreshold)
//  - If patternHint is provided (not 'auto'), use it; otherwise use routing.pattern.
//  - If resolved pattern is not 'chain' AND confidence < confidenceThreshold,
//    upgrade to 'fan-out'.
//  - Dispatch to the correct pattern function and return its result.
export async function executePattern(patternHint, routing, messages, callAgent, confidenceThreshold = 0.75) {
  // TODO: implement
}
