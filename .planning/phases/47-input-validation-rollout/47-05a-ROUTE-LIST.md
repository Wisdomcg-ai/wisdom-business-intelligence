# 47-05a Route List — admin/coach/clients/sessions/team/monthly-report subtree

Observe-mode wrap (Option B). Verb-level dedup: exports already wrapped in waves 2b/3 are
marked WRAPPED-ALREADY and left untouched. Only UNWRAPPED verbs are wrapped this slice.

Legend:
- `WRAPPED-ALREADY` — export already calls withSchema/withQuerySchema (DO NOT touch)
- `WRAP body(N)` — body verb, withSchema, N modeled fields
- `WRAP query(N)` — query GET/DELETE, withQuerySchema, N modeled fields
- `WRAP query(0)` — input-less GET, permissive withQuerySchema(z.object({}))
- `WRAP body(0)` — input-less POST, permissive withSchema(z.object({}))
- `SKIP (no input)` — DELETE with no body and no searchParams; file already carries a wrapper via sibling verb

## Expected commit count
One commit per top-level subdir touched: **admin, coach, coach-questions, sessions, team, monthly-report** = up to 6 commits.

---

## admin/

| file | routeId | export | classification |
|---|---|---|---|
| admin/activity/route.ts | admin/activity | GET (query `range`) | WRAP query(1) |
| admin/check-auth/route.ts | admin/check-auth | GET | WRAPPED-ALREADY |
| admin/clients/resend-invitation/route.ts | admin/clients/resend-invitation | POST | WRAPPED-ALREADY |
| admin/clients/route.ts | admin/clients | POST | WRAPPED-ALREADY |
| admin/clients/route.ts | admin/clients | PATCH | WRAPPED-ALREADY |
| admin/clients/route.ts | admin/clients | DELETE (query `id`) | WRAP query(1) |
| admin/coaches/route.ts | admin/coaches | POST | WRAPPED-ALREADY |
| admin/coaches/route.ts | admin/coaches | PATCH | WRAPPED-ALREADY |
| admin/coaches/route.ts | admin/coaches | GET (no input) | WRAP query(0) |
| admin/coaches/route.ts | admin/coaches | DELETE (query `id`) | WRAP query(1) |
| admin/demo-client/route.ts | admin/demo-client | POST (no inbound body) | WRAP body(0) |
| admin/demo-client/route.ts | admin/demo-client | GET (no input) | WRAP query(0) |
| admin/demo-client/route.ts | admin/demo-client | DELETE (no input) | WRAP query(0) |
| admin/reset-password/route.ts | admin/reset-password | POST | WRAPPED-ALREADY |

## clients/

| file | routeId | export | classification |
|---|---|---|---|
| clients/send-invitation/route.ts | clients/send-invitation | POST | WRAPPED-ALREADY |

## coach/

| file | routeId | export | classification |
|---|---|---|---|
| coach/client-completion/route.ts | coach/client-completion | GET (no input) | WRAP query(0) |
| coach/clients/[id]/route.ts | coach/clients/[id] | GET | WRAPPED-ALREADY |
| coach/clients/[id]/route.ts | coach/clients/[id] | PUT | WRAPPED-ALREADY |
| coach/clients/route.ts | coach/clients | POST (body) | WRAP body(22) |
| coach/clients/route.ts | coach/clients | GET (no input) | WRAP query(0) |
| coach/stats/route.ts | coach/stats | GET | WRAPPED-ALREADY |

## coach-questions/

| file | routeId | export | classification |
|---|---|---|---|
| coach-questions/route.ts | coach-questions | POST (body) | WRAP body(3) |
| coach-questions/route.ts | coach-questions | GET (query) | WRAP query(2) |

## sessions/

| file | routeId | export | classification |
|---|---|---|---|
| sessions/route.ts | sessions | GET (query `business_id`) | WRAP query(1) |
| sessions/route.ts | sessions | POST (body) | WRAP body(5) |
| sessions/[id]/route.ts | sessions/[id] | GET (no input) | WRAP query(0) |
| sessions/[id]/route.ts | sessions/[id] | PUT (body) | WRAP body(7) |
| sessions/[id]/route.ts | sessions/[id] | DELETE (no input) | SKIP (no input) |
| sessions/[id]/actions/route.ts | sessions/[id]/actions | POST (body) | WRAP body(2) |
| sessions/[id]/analyze-transcript/route.ts | sessions/[id]/analyze-transcript | POST (body) | WRAP body(1) |

## team/

| file | routeId | export | classification |
|---|---|---|---|
| team/invite/route.ts | team/invite | POST | WRAPPED-ALREADY |
| team/org-chart/route.ts | team/org-chart | GET (query `user_id`) | WRAP query(1) |
| team/org-chart/route.ts | team/org-chart | POST (body) | WRAP body(3) |
| team/remove-member/route.ts | team/remove-member | POST | WRAPPED-ALREADY |

## monthly-report/

| file | routeId | export | classification |
|---|---|---|---|
| monthly-report/account-mappings/route.ts | monthly-report/account-mappings | GET (query `business_id`) | WRAP query(1) |
| monthly-report/account-mappings/route.ts | monthly-report/account-mappings | POST (body) | WRAP body(9) |
| monthly-report/account-mappings/route.ts | monthly-report/account-mappings | PUT (body) | WRAP body(2) |
| monthly-report/auto-map/route.ts | monthly-report/auto-map | POST (body) | WRAP body(1) |
| monthly-report/commentary/route.ts | monthly-report/commentary | POST (body) | WRAP body(6) |
| monthly-report/consolidated-bs/route.ts | monthly-report/consolidated-bs | POST (body) | WRAP body(3) |
| monthly-report/consolidated-cashflow/route.ts | monthly-report/consolidated-cashflow | POST (body) | WRAP body(2) |
| monthly-report/consolidated/route.ts | monthly-report/consolidated | POST (body) | WRAP body(3) |
| monthly-report/debug/route.ts | monthly-report/debug | GET (query `business_id`) | WRAP query(1) |
| monthly-report/full-year/route.ts | monthly-report/full-year | POST (body) | WRAP body(2) |
| monthly-report/generate/route.ts | monthly-report/generate | POST (body) | WRAP body(4) |
| monthly-report/settings/route.ts | monthly-report/settings | GET (query `business_id`) | WRAP query(1) |
| monthly-report/settings/route.ts | monthly-report/settings | POST (body) | WRAP body(11) |
| monthly-report/snapshot/route.ts | monthly-report/snapshot | GET (query `business_id`,`report_month`) | WRAP query(2) |
| monthly-report/snapshot/route.ts | monthly-report/snapshot | POST (body) | WRAP body(11) |
| monthly-report/subscription-detail/route.ts | monthly-report/subscription-detail | POST (body) | WRAP body(3) |
| monthly-report/sync-xero/route.ts | monthly-report/sync-xero | POST (body) | WRAP body(1) |
| monthly-report/templates/route.ts | monthly-report/templates | GET (query `business_id`) | WRAP query(1) |
| monthly-report/templates/route.ts | monthly-report/templates | POST (body) | WRAP body(8) |
| monthly-report/templates/route.ts | monthly-report/templates | PUT (body) | WRAP body(2) |
| monthly-report/templates/route.ts | monthly-report/templates | DELETE (query `id`,`business_id`) | WRAP query(2) |
| monthly-report/wages-detail/route.ts | monthly-report/wages-detail | POST (body) | WRAP body(5) |
