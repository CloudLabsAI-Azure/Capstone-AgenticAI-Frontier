/**
 * Agent Registry — Declarative metadata for all specialist agents.
 *
 * Each entry describes a Foundry IQ application agent: its environment-variable
 * keys, the domains it handles, and its relative priority when multiple agents
 * could answer a query.
 *
 * The orchestration engine uses this registry to:
 *   - Build the routing prompt sent to the AI router
 *   - Resolve env-var names → concrete app-name / model strings at runtime
 *   - Determine which agents participate in Fan-Out or Chain patterns
 */

export const AGENT_REGISTRY = {
  orchestrator: {
    id: 'Orchestrator-Agent',
    displayName: 'Orchestrator',
    appEnvKey: 'AGENT_APP_ORCHESTRATOR',
    modelEnvKey: 'AGENT_MODEL_ORCHESTRATOR',
    defaultApp: 'Orchestrator-Agent',
    defaultModel: 'gpt-4.1',
    domains: [],          // meta-agent; does not own a domain
    priority: 0,
    description:
      'Top-level orchestrator responsible for intent classification and response ' +
      'synthesis in Fan-Out scenarios. Not used as a leaf specialist.',
  },

  hr: {
    id: 'HR-Agent',
    displayName: 'HR Agent',
    appEnvKey: 'AGENT_APP_HR',
    modelEnvKey: 'AGENT_MODEL_HR',
    defaultApp: 'HR-Agent',
    defaultModel: 'gpt-4.1',
    domains: [
      'leave', 'holiday', 'salary', 'onboarding', 'health insurance',
      'parental leave', 'sick leave', 'flexible working', 'remote work',
      'work hours', 'employee benefits', 'pay', 'payroll', 'performance review',
      'recruitment', 'resignation', 'termination', 'probation',
    ],
    priority: 2,
    description:
      'Answers questions about HR policies, employee benefits, leave entitlements, ' +
      'onboarding, compensation, and flexible-working arrangements.',
  },

  it: {
    id: 'ITSupport-Agent',
    displayName: 'IT Support Agent',
    appEnvKey: 'AGENT_APP_IT',
    modelEnvKey: 'AGENT_MODEL_IT',
    defaultApp: 'ITSupport-Agent',
    defaultModel: 'gpt-4.1',
    domains: [
      'password', 'VPN', 'laptop', 'network', 'wifi', 'internet', 'software',
      'hardware', 'login', 'access', 'monitor', 'printer', 'email', 'computer',
      'mouse', 'keyboard', 'account', 'two-factor', '2FA', 'remote desktop',
      'installation', 'driver', 'reboot', 'crash', 'blue screen',
    ],
    priority: 2,
    description:
      'Handles IT troubleshooting: password resets, VPN issues, hardware setup, ' +
      'software installations, network connectivity, and account access problems.',
  },

  compliance: {
    id: 'Compliance-Agent',
    displayName: 'Compliance Agent',
    appEnvKey: 'AGENT_APP_COMPLIANCE',
    modelEnvKey: 'AGENT_MODEL_COMPLIANCE',
    defaultApp: 'Compliance-Agent',
    defaultModel: 'gpt-4.1',
    domains: [
      'compliance', 'corruption', 'bribery', 'DPO', 'anti-bribery', 'audit',
      'security policy', 'GDPR', 'regulation', 'legal', 'risk', 'privacy',
      'governance', 'SOC2', 'data protection', 'whistleblower', 'ethics',
      'code of conduct', 'sanctions', 'due diligence',
    ],
    priority: 3,   // highest priority — acts as gatekeeper in Chain pattern
    description:
      'Advises on regulatory compliance, GDPR, anti-bribery, SOC2, code of conduct, ' +
      'data protection, and ethics policies. Serves as the compliance gatekeeper ' +
      'in Sequential Chain scenarios.',
  },
};

/** Returns all specialist agents (excludes the orchestrator meta-agent). */
export function getSpecialists() {
  return Object.values(AGENT_REGISTRY).filter(a => a.id !== 'Orchestrator-Agent');
}

/**
 * Resolves the concrete Foundry app-name and model for an agent entry,
 * reading from environment variables with sensible defaults.
 */
export function resolveAgent(agentEntry) {
  return {
    ...agentEntry,
    app: process.env[agentEntry.appEnvKey] || agentEntry.defaultApp,
    model: process.env[agentEntry.modelEnvKey] || agentEntry.defaultModel,
  };
}

/** Finds a registry entry by its Foundry agent ID string, e.g. 'HR-Agent'. */
export function findById(agentId) {
  return Object.values(AGENT_REGISTRY).find(a => a.id === agentId);
}
