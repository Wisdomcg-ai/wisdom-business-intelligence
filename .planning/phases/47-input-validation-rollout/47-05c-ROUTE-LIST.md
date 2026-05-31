# 47-05c — Per-Verb Route Checklist (misc / infra subtree)

Slice c of 3. Subtree: cron, auth, ai, ai-assist, chat, todos, notifications, ideas, email, documents, activity-log, processes.

Legend:
- **WRAP-body** → unwrapped mutating verb, `withSchema(routeId, Schema, handler)`, real fields modeled.
- **WRAP-query** → query GET, `withQuerySchema(routeId, Schema, handler)`, searchParams modeled.
- **WRAP-empty** → input-less verb (cron GET / param-only DELETE), `withQuerySchema`/`withSchema(routeId, z.object({}), handler)` (exempt from substance check).
- **ALREADY** → wrapped by 47-02; LEAVE untouched (never double-wrap).
- *(bridge)* → handler keeps `NextRequest` param → wire with `handler as unknown as (request: Request) => Promise<Response>`.

28 route.ts files in this subtree. 1 file (`notifications/route.ts`) already wrapped by 47-02 (both verbs).

## activity-log
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| activity-log/route.ts | `activity-log` | POST (NextRequest) | WRAP-body *(bridge)* | business_id, table_name, record_id, action, field_name?, old_value?, new_value?, changes?, description?, page_path? (10) |
| activity-log/route.ts | `activity-log` | GET (NextRequest) | WRAP-query *(bridge)* | business_id?, table_name?, user_id?, limit?, offset? (5) |
| activity-log/login/route.ts | `activity-log/login` | POST (NextRequest) | WRAP-body *(bridge)* | business_id (1) |
| activity-log/login/route.ts | `activity-log/login` | GET (NextRequest) | WRAP-query *(bridge)* | business_id? (1) |

## auth
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| auth/logout/route.ts | `auth/logout` | POST (NextRequest, no body read) | WRAP-empty *(bridge)* | — (0, exempt) |
| auth/reset-password/route.ts | `auth/reset-password` | POST (NextRequest) | WRAP-body *(bridge)* | email (1) |
| auth/update-password/route.ts | `auth/update-password` | GET (NextRequest, uses nextUrl) | WRAP-query *(bridge, keeps NextRequest)* | token? (1) |
| auth/update-password/route.ts | `auth/update-password` | POST (NextRequest) | WRAP-body *(bridge)* | token, password (2) |

## ai / ai-assist
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| ai-assist/route.ts | `ai-assist` | POST (Request) | WRAP-body | fieldType, currentValue?, businessContext? (3) |
| ai/advisor/route.ts | `ai/advisor` | POST (Request) | WRAP-body | type, position?, employmentType?, projectType?, scope?, complexity? (6) |
| ai/advisor/route.ts | `ai/advisor` | PATCH (Request) | WRAP-body | interactionId?, action?, userValue? (3) |
| ai/forecast-assistant/route.ts | `ai/forecast-assistant` | POST (Request) | WRAP-body | message, systemPrompt?, context?, history? (4) |
| ai/forecast-insights/route.ts | `ai/forecast-insights` | POST (Request) | WRAP-body | type, data (2) |

## chat
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| chat/messages/route.ts | `chat/messages` | GET (Request) | WRAP-query | business_id?, limit? (2) |
| chat/messages/route.ts | `chat/messages` | POST (Request) | WRAP-body | business_id, message (2) |

## cron (all input-less auth-header GETs → WRAP-empty, exempt)
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| cron/daily-health-report/route.ts | `cron/daily-health-report` | GET (NextRequest) | WRAP-empty *(bridge)* | — (0, exempt) |
| cron/reconciliation-watch/route.ts | `cron/reconciliation-watch` | GET (NextRequest) | WRAP-empty *(bridge)* | — (0, exempt) |
| cron/refresh-xero-tokens/route.ts | `cron/refresh-xero-tokens` | GET (NextRequest) | WRAP-empty *(bridge)* | — (0, exempt) |
| cron/sync-all-xero/route.ts | `cron/sync-all-xero` | GET (NextRequest) | WRAP-empty *(bridge)* | — (0, exempt) |
| cron/weekly-digest/route.ts | `cron/weekly-digest` | GET (NextRequest) | WRAP-empty *(bridge)* | — (0, exempt) |

## documents
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| documents/route.ts | `documents` | GET (Request) | WRAP-query | business_id? (1) |
| documents/route.ts | `documents` | POST (Request, formData) | WRAP-body (form fields modeled; .json() no-ops on multipart) | business_id?, folder? (2) |
| documents/[id]/download/route.ts | `documents/[id]/download` | GET (Request, legacy params) | WRAP-empty (param-only, no body/query) | — (0, exempt) |

## email (both super_admin-gated POSTs)
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| email/send/route.ts | `email/send` | POST (NextRequest) | WRAP-body *(bridge)* | type, to?, subject?, html?, from?, replyTo?, ...passthrough (per-type) (6+) |
| email/test/route.ts | `email/test` | POST (NextRequest) | WRAP-body *(bridge)* | to, name?, type?, all? (4) |

## ideas (Next15 Promise ctx)
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| ideas/[id]/share/route.ts | `ideas/[id]/share` | PATCH (Request, Promise ctx) | WRAP-body | mode, userIds? (2) |
| ideas/[id]/status/route.ts | `ideas/[id]/status` | PATCH (Request, Promise ctx) | WRAP-body | status (1) |

## notifications
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| notifications/route.ts | `notifications` | GET | **ALREADY (47-02)** | — leave |
| notifications/route.ts | `notifications` | PUT | **ALREADY (47-02)** | — leave |
| notifications/create/route.ts | `notifications/create` | POST (Request) | WRAP-body | target_user_id, business_id?, type, title, message, link?, metadata? (7) |

## processes
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| processes/route.ts | `processes` | GET (Request) | WRAP-query | user_id? (1) |
| processes/route.ts | `processes` | POST (Request) | WRAP-body | name, description?, process_data?, user_id? (4) |
| processes/[id]/route.ts | `processes/[id]` | GET (Request, legacy params) | WRAP-empty (param-only) | — (0, exempt) |
| processes/[id]/route.ts | `processes/[id]` | PUT (Request, legacy params) | WRAP-body | name?, description?, status?, process_data?, step_count?, decision_count?, swimlane_count? (7) |
| processes/[id]/route.ts | `processes/[id]` | DELETE (Request, legacy params) | WRAP-empty (no body) | — (0, exempt) |
| processes/ai-mapper/route.ts | `processes/ai-mapper` | POST (Request) | WRAP-body | messages, currentProcess? (2) |

## todos (Next15 Promise ctx)
| File | routeId | Export | Action | Fields |
|------|---------|--------|--------|--------|
| todos/[id]/complete/route.ts | `todos/[id]/complete` | PATCH (Request, Promise ctx) | WRAP-body | completed (1) |
| todos/[id]/share/route.ts | `todos/[id]/share` | PATCH (Request, Promise ctx) | WRAP-body | mode, userIds? (2) |

## Commit plan (one batch per top-level subdir touched, 11 commits)
1. activity-log  2. auth  3. ai + ai-assist  4. chat  5. cron  6. documents  7. email  8. ideas  9. notifications (create only)  10. processes  11. todos

## Full-surface accounting (criterion #1, owned by this slice)
- Live route count: `find src/app/api -name route.ts | wc -l` = **130**
- Pre-05c wrapped: 79. This slice wraps the remaining 27 files (notifications/route.ts already counted).
- Target after 05c: wrapped count ≥ 130.
