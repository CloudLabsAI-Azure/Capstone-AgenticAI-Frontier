/**
 * Orchestration Engine — Entry Point
 *
 * This module wires together the Foundry IQ trust layer, the AI-powered router,
 * and the pattern implementations into a single `orchestrate()` function consumed
 * by server.js.
 *
 * Execution flow:
 *   1. Extract user query text from the messages array
 *   2. Run the AI router to classify intent and obtain a routing decision
 *   3. Select and execute the appropriate orchestration pattern
 *   4. Build and log an audit entry via the trust layer
 *   5. Return the agent response + a rich orchestrationTrace payload
 *
 * The `foundryCall` function is injected by the caller (server.js) rather than
 * imported directly, keeping this module transport-agnostic and testable.
 */

import { routeQuery }         from './router.js';
import { executePattern }     from './patterns.js';
import { generateTraceId, createAuditEntry } from './trustLayer.js';

/** Threshold below which the engine auto-escalates to fan-out (0–1 float). */
const DEFAULT_CONFIDENCE_THRESHOLD =
  parseFloat(process.env.ROUTER_CONFIDENCE_THRESHOLD || '0.75');

// ── Text extraction helpers ───────────────────────────────────────────────────

/**
 * Extracts the plain-text content of the last user message from a
 * Responses-API-style messages array.
 */
function extractUserQuery(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;

    // Responses API: content may be a string or an array of content parts
    if (typeof m.content === 'string') return m.content;
    if (typeof m.text    === 'string') return m.text;
    if (Array.isArray(m.content)) {
      const textPart = m.content.find(p => p.type === 'input_text' || p.type === 'text');
      if (textPart) return textPart.text || textPart.content || '';
    }
  }
  return '';
}

// ── Orchestration engine ──────────────────────────────────────────────────────

/**
 * Main orchestration entry point.
 *
 * @param {Object[]} messages        - Conversation history (Responses API format).
 * @param {string}   patternHint     - 'auto' | 'hub-and-spoke' | 'fan-out' | 'chain'.
 * @param {Function} foundryCall     - Async fn(appName, model, messages) → { message, citations }.
 * @param {Object}   auditLog        - AuditLog instance from trustLayer.
 *
 * @returns {Promise<OrchestrationResult>}
 *   { message, citations, resolvedAgentId, orchestrationTrace }
 */
export async function orchestrate(messages, patternHint = 'auto', foundryCall, auditLog) {
  const traceId   = generateTraceId();
  const startTime = Date.now();

  const userQuery = extractUserQuery(messages);

  // ── Step 1: AI-powered routing ──────────────────────────────────────────
  // The router calls Foundry IQ with a routing-specific system prompt.
  // On failure it transparently falls back to keyword-based routing.

  const routing = await routeQuery(userQuery, async (app, model, routingMessages) => {
    const result = await foundryCall(app, model, routingMessages);
    return result.message; // router only needs the text
  });

  // ── Step 2: Pattern execution ───────────────────────────────────────────

  const patternResult = await executePattern(
    patternHint,
    routing,
    messages,
    foundryCall,
    DEFAULT_CONFIDENCE_THRESHOLD
  );

  // ── Step 3: Audit entry ─────────────────────────────────────────────────

  const auditEntry = createAuditEntry({
    traceId,
    pattern: patternResult.patternUsed,
    agentsInvoked: patternResult.agentsInvoked,
    confidence: routing.confidence,
    routingReason: routing.reasoning,
    startTime,
    fallback: routing.fallback || false,
    userQuery,
  });

  auditLog.append(auditEntry);

  // ── Step 4: Assemble orchestration trace (returned to client) ───────────

  const orchestrationTrace = {
    traceId,
    pattern: patternResult.patternUsed,
    agentsInvoked: patternResult.agentsInvoked,
    confidence: auditEntry.confidence,
    confidenceTier: auditEntry.confidenceTier,
    routingReason: routing.reasoning,
    patternHintReceived: patternHint,
    fallbackUsed: routing.fallback || false,
    latencyMs: auditEntry.latencyMs,
    // Optional per-pattern extras
    ...(patternResult.chainStep      && { chainStep: patternResult.chainStep }),
    ...(patternResult.complianceContext && { complianceContext: patternResult.complianceContext }),
    ...(patternResult.agentResponses && { agentResponses: patternResult.agentResponses }),
  };

  return {
    message:          patternResult.message,
    citations:        patternResult.citations || [],
    resolvedAgentId:  patternResult.agentsInvoked[patternResult.agentsInvoked.length - 1],
    orchestrationTrace,
  };
}
