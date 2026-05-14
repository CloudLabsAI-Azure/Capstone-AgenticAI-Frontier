// ============================================================
// orchestration/router.js
// ============================================================
// AI-powered intent router.
// Uses the Foundry Orchestrator agent to classify user intent
// and return a routing decision. Falls back to keyword rules
// if the AI call fails for any reason.
// ============================================================

// TODO: Import AGENT_REGISTRY, getSpecialists, resolveAgent from ./agentRegistry.js

// ── Routing system prompt ─────────────────────────────────────────────────────

// TODO: Implement function buildRoutingSystemPrompt(specialists)
//  Build a system prompt string that:
//   - Lists all specialist agents with their descriptions
//   - Instructs the model to respond ONLY with a JSON object matching:
//     { primaryAgent, secondaryAgents, confidence, pattern, reasoning }
//   - Defines pattern selection rules:
//     "hub-and-spoke": single agent, confidence >= 0.75
//     "fan-out":       multiple domains or confidence < 0.75
//     "chain":         compliance vetting required first
function buildRoutingSystemPrompt(specialists) {
  // TODO: implement
}

// ── Keyword fallback ──────────────────────────────────────────────────────────

// TODO: Define const KEYWORD_RULES — an array of objects { pattern: /regex/i, agentId }
//  covering HR, IT, and Compliance keyword sets.
const KEYWORD_RULES = [
  // TODO: HR keywords (leave, holiday, salary, onboarding, flexible working, …)
  // TODO: IT keywords (password, VPN, laptop, network, software, …)
  // TODO: Compliance keywords (compliance, GDPR, bribery, SOC2, ethics, …)
];

// TODO: Implement function keywordFallback(userText)
//  - Filter KEYWORD_RULES by which patterns match userText.
//  - If 0 matches: route to Orchestrator-Agent, confidence 0.4, pattern hub-and-spoke
//  - If 1 match:   route to that agent,          confidence 0.65, pattern hub-and-spoke
//  - If 2+ matches: route to first agent,        confidence 0.50, pattern fan-out
//                   secondaryAgents = remaining matched agents
//  - Always include fallback: true in the returned object.
function keywordFallback(userText) {
  // TODO: implement
}

// ── Main export ───────────────────────────────────────────────────────────────

// TODO: Export async function routeQuery(userQuery, foundryCall)
//  1. Call getSpecialists() and buildRoutingSystemPrompt().
//  2. Resolve the orchestrator agent using resolveAgent(AGENT_REGISTRY.orchestrator).
//  3. Call foundryCall(orch.app, orch.model, [ system message, user message ])
//     to get the raw routing JSON string.
//  4. Parse the JSON, validate required fields (primaryAgent, pattern, confidence).
//  5. Return the decision with fallback: false.
//  6. On any error, log a warning and return keywordFallback(userQuery).
export async function routeQuery(userQuery, foundryCall) {
  // TODO: implement
}
