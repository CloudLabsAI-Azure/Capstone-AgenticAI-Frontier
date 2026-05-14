/**
 * Trust Layer — Microsoft Foundry IQ intelligence and trust infrastructure.
 *
 * Responsibilities:
 *   - Trace ID generation (unique per interaction)
 *   - Per-interaction audit logging (pattern, agents, latency, confidence)
 *   - Confidence scoring helpers
 *   - Agent provenance tracking
 *
 * The AuditLog is an in-memory ring-buffer (capped at MAX_ENTRIES).
 * Expose it via GET /api/audit for operational visibility.
 */

import { randomUUID } from 'crypto';

const MAX_ENTRIES = 500;

// ── Trace ID ─────────────────────────────────────────────────────────────────

/** Generates a globally-unique trace identifier for a single orchestration run. */
export function generateTraceId() {
  return randomUUID();
}

// ── Confidence helpers ────────────────────────────────────────────────────────

/**
 * Normalises a raw confidence value (0–1 float or percentage string) to a
 * 0–100 integer.  Returns null when the value cannot be parsed.
 */
export function normaliseConfidence(raw) {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

/**
 * Determines the confidence tier label used for UI rendering.
 *   ≥ 80  → 'high'
 *   ≥ 50  → 'medium'
 *   < 50  → 'low'
 */
export function confidenceTier(score) {
  if (score === null || score === undefined) return 'unknown';
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

/**
 * Immutable audit entry describing a single orchestrated interaction.
 *
 * @typedef {Object} AuditEntry
 * @property {string}   traceId        - Unique trace ID
 * @property {string}   timestamp      - ISO-8601 wall-clock time
 * @property {string}   pattern        - Orchestration pattern used
 * @property {string[]} agentsInvoked  - Ordered list of agent IDs called
 * @property {number|null} confidence  - Routing confidence (0–100)
 * @property {string}   confidenceTier - 'high' | 'medium' | 'low' | 'unknown'
 * @property {string}   routingReason  - Human-readable routing rationale
 * @property {number}   latencyMs      - Total wall-clock latency in ms
 * @property {boolean}  fallback       - True if keyword-fallback router was used
 * @property {string}   userQuery      - Truncated user query (first 120 chars)
 */

export class AuditLog {
  constructor() {
    this._entries = [];
  }

  /** Append a new audit entry, evicting the oldest when the buffer is full. */
  append(entry) {
    if (this._entries.length >= MAX_ENTRIES) {
      this._entries.shift();
    }
    this._entries.push(Object.freeze(entry));
  }

  /** Returns a shallow copy of all entries, newest first. */
  all() {
    return [...this._entries].reverse();
  }

  /** Returns the N most recent entries. */
  recent(n = 20) {
    return this.all().slice(0, n);
  }

  get size() {
    return this._entries.length;
  }
}

/**
 * Constructs a well-formed audit entry.  Call this after an orchestration run
 * completes (or fails) and pass the result to auditLog.append().
 */
export function createAuditEntry({
  traceId,
  pattern,
  agentsInvoked,
  confidence,
  routingReason,
  startTime,
  fallback = false,
  userQuery = '',
}) {
  const normConf = normaliseConfidence(confidence);
  return {
    traceId,
    timestamp: new Date().toISOString(),
    pattern,
    agentsInvoked: agentsInvoked || [],
    confidence: normConf,
    confidenceTier: confidenceTier(normConf),
    routingReason: routingReason || '',
    latencyMs: startTime ? Date.now() - startTime : null,
    fallback,
    userQuery: String(userQuery).slice(0, 120),
  };
}
