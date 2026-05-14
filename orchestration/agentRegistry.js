// ============================================================
// orchestration/agentRegistry.js
// ============================================================
// Declarative registry of all agents in the system.
// The router and pattern engine import helpers from here.
// ============================================================

// TODO: Export a const AGENT_REGISTRY object with four keys:
//   orchestrator, hr, it, compliance
//
// Each entry must have:
//   id           – The agent name as registered in Foundry (e.g. 'HR-Agent')
//   displayName  – Human-readable label (e.g. 'HR Agent')
//   appEnvKey    – The env var name for the agent app  (e.g. 'AGENT_APP_HR')
//   modelEnvKey  – The env var name for the model      (e.g. 'AGENT_MODEL_HR')
//   defaultApp   – Fallback app name if env var is unset
//   defaultModel – Fallback model name if env var is unset (use 'gpt-4.1')
//   domains      – Array of keywords this agent owns (used by keyword fallback)
//   priority     – Numeric priority (orchestrator = 0, specialists = 2-3)
//   description  – One sentence used in the routing system prompt
//
// Example domains for each agent:
//   HR:         leave, holiday, salary, onboarding, flexible working, payroll, …
//   IT:         password, VPN, laptop, network, wifi, software, hardware, login, …
//   Compliance: compliance, GDPR, bribery, SOC2, data protection, ethics, …
//   Orchestrator: [] (empty — does not own any domain)

export const AGENT_REGISTRY = {
  // TODO: Fill in orchestrator entry
  orchestrator: {},

  // TODO: Fill in hr entry
  hr: {},

  // TODO: Fill in it entry
  it: {},

  // TODO: Fill in compliance entry
  compliance: {},
};

// TODO: Export function getSpecialists()
//  Returns all registry entries except the Orchestrator.
export function getSpecialists() {
  // TODO: implement
}

// TODO: Export function resolveAgent(agentEntry)
//  Returns a copy of agentEntry with 'app' and 'model' resolved
//  from process.env (falling back to defaultApp / defaultModel).
export function resolveAgent(agentEntry) {
  // TODO: implement
}

// TODO: Export function findById(agentId)
//  Finds and returns the registry entry whose id matches agentId.
export function findById(agentId) {
  // TODO: implement
}
