// ============================================================
// public/app.js — Chat UI Logic
// ============================================================
// Implements:
//  - Multi-session management (localStorage)
//  - Intent detection (ticket creation, lookup, solution, list)
//  - Ticket flows (inline form, track by ID, list recent)
//  - Chat submission and history injection
//  - Message rendering with Markdown and orchestration trace
// ============================================================

// ── Constants ────────────────────────────────────────────────
const CHAT_SESSIONS_KEY = 'foundry_iq_chat_sessions_v1'; // localStorage key

// ── State ────────────────────────────────────────────────────
let chatSessions   = [];   // Array of session objects
let activeSessionId = null; // ID of the currently visible session

// ── DOM references ───────────────────────────────────────────
// TODO: Get references to the key DOM elements:
//   chatMessages, chatForm, chatInput, sendBtn,
//   agentSelector, patternSelector, clearBtn,
//   btnNewChat, chatSessions (div), statusDot, agentName, agentDesc, patternBadge

// ════════════════════════════════════════════════════════════
// SECTION 1: Session Management
// ════════════════════════════════════════════════════════════

// TODO: Implement function newSession(title = 'New Chat')
//  Creates and returns a session object: { id, title, messages: [], updatedAt }

// TODO: Implement function saveSessions()
//  Persists chatSessions array to localStorage under CHAT_SESSIONS_KEY.

// TODO: Implement function initChatSessions()
//  - Load sessions from localStorage.
//  - If none exist, create a default session.
//  - Set activeSessionId to the first session's id.
//  - Render the session list and the active conversation.

// TODO: Implement function persistActiveSession()
//  - Find the active session in chatSessions.
//  - Update its messages from the current DOM (or from a local messages array).
//  - Set updatedAt = new Date().toISOString().
//  - Call saveSessions() and re-render the session list.

// TODO: Implement function switchSession(sessionId)
//  - Set activeSessionId = sessionId.
//  - Clear chatMessages div.
//  - Render all messages from the session's history.
//  - Update session list to highlight the active item.

// TODO: Implement function createAndSwitchNewSession()
//  - Create a new session, push it to chatSessions, save, switch to it.

// TODO: Implement function renderSessionList()
//  - Clear the #chatSessions div.
//  - For each session render a .chat-session-item div with title and time.
//  - Mark the active session with class 'active'.
//  - On click, call switchSession(session.id).

// TODO: Implement function renderConversationFromHistory(messages)
//  - For each message in the array call appendMessage() or equivalent.

// TODO: Implement function deriveSessionTitle(messages)
//  - Return the text of the first user message (truncated to ~40 chars),
//    or 'New Chat' if none.

// ════════════════════════════════════════════════════════════
// SECTION 2: Intent Detection
// ════════════════════════════════════════════════════════════

// TODO: Implement function isTicketCreationIntent(text)
//  Returns true when the message asks to create/raise/submit/log a ticket.

// TODO: Implement function getTicketIdFromText(text)
//  Returns the first IT-#### match found in text, or null.

// TODO: Implement function isTicketLookupIntent(text)
//  Returns true when the message asks for status/track/check of a ticket.

// TODO: Implement function isTicketSolutionIntent(text)
//  Returns true when the message asks for solution/fix/how-to/resolve a ticket.

// TODO: Implement function isTicketListIntent(text)
//  Returns true when the message asks to list/show all/recent tickets.

// ════════════════════════════════════════════════════════════
// SECTION 3: Ticket Flows
// ════════════════════════════════════════════════════════════

// TODO: Implement function showTicketForm()
//  Renders an inline HTML form inside the chat for:
//   Name, Issue Title, Category (select), Priority (select), Description (textarea)
//  On submit: POST /api/tickets, show confirmation with ticket ID.

// TODO: Implement function trackTicket(ticketId)
//  GET /api/tickets/:id and render a ticket detail card in the chat.

// TODO: Implement function listRecentTickets()
//  GET /api/tickets and render a list of ticket summary cards in the chat.

// ════════════════════════════════════════════════════════════
// SECTION 4: Chat Submission
// ════════════════════════════════════════════════════════════

// TODO: Implement async function handleSubmit(event)
//  1. Prevent default form submission.
//  2. Read and trim chatInput.value; return if empty.
//  3. Append the user message bubble.
//  4. Intent routing (in this order):
//     a. If isTicketCreationIntent → showTicketForm()
//     b. Else if ticketId found AND isTicketLookupIntent AND NOT isTicketSolutionIntent
//        → trackTicket(ticketId)
//     c. Else if isTicketListIntent AND no ticketId AND NOT isTicketSolutionIntent
//        → listRecentTickets()
//     d. Else → POST /api/chat with { messages (history), agent, pattern }
//  5. Show typing indicator, await response, hide indicator.
//  6. Append assistant bubble with message + orchestration trace.
//  7. Call persistActiveSession().

// ════════════════════════════════════════════════════════════
// SECTION 5: Rendering Helpers
// ════════════════════════════════════════════════════════════

// TODO: Implement function escapeHtml(str)
//  Replace &, <, >, ", ' with their HTML entities.

// TODO: Implement function renderMarkdown(text)
//  Convert basic Markdown to HTML:
//   **bold**, *italic*, `code`, ```code blocks```, ## headings, bullet lists

// TODO: Implement function appendMessage(role, content, extra)
//  Creates a .message.user or .message.assistant div,
//  sets innerHTML using renderMarkdown(content),
//  appends to #chatMessages and scrolls into view.

// TODO: Implement function renderOrchTrace(trace)
//  Renders a collapsible <details> panel showing:
//   traceId, pattern, agentsInvoked, confidence, confidenceTier,
//   latencyMs, routingReason, fallbackUsed

// TODO: Implement function showTypingIndicator() / hideTypingIndicator()

// ════════════════════════════════════════════════════════════
// SECTION 6: Agent Status Bar
// ════════════════════════════════════════════════════════════

// TODO: Implement function updateAgentStatus(agentId)
//  Update statusDot colour, agentName text, and agentDesc text
//  based on which agent responded.

// ════════════════════════════════════════════════════════════
// SECTION 7: Initialisation
// ════════════════════════════════════════════════════════════

// TODO: Add event listeners:
//   chatForm 'submit'   → handleSubmit
//   clearBtn 'click'    → clear chatMessages, reset session messages
//   btnNewChat 'click'  → createAndSwitchNewSession
//   agentSelector / patternSelector 'change' → update patternBadge label

// TODO: Call initChatSessions() when the DOM is ready (DOMContentLoaded).
