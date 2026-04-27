# Phase 35: Report Approval + Delivery Workflow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 35-report-approval-delivery-workflow
**Areas discussed:** Status transitions & actors, Delivery mechanism (pivoted from Make.com to Resend), Edit-after-approval, Report URL, Email copy & sender

---

## Preliminary: Delivery mechanism (scope pivot)

| Option | Description | Selected |
|---|---|---|
| Stay with Make.com webhook | ROADMAP default: WisdomBI fires webhook → Make scenario sends email | |
| Direct email via Resend | WisdomBI owns the send, uses React Email / transactional provider | ✓ |
| Generic outbound webhook | Same plumbing as Make but vendor-neutral | |
| Drop automation entirely | Platform tracks status only; coach emails manually | |

**User's choice:** Direct email via Resend
**Notes:** User challenged the Make.com assumption ("why do we need make.com"). Concluded that owning email delivery is a cleaner product story for a CFO SaaS, avoids per-business webhook URL setup, keeps all audit data in-platform.

---

## Area 1: Status transitions & who can act

### Who can move draft → ready_for_review?

| Option | Description | Selected |
|---|---|---|
| Coach only | Explicit "Mark Ready for Review" button, client has no role | ✓ |
| Coach or client | Client can flag they're happy from their side | |
| Automatic when commentary_approved = true | Use existing bool to auto-flip | |

**User's choice:** Coach only (recommended)

### Can coach skip ready_for_review → approved directly?

| Option | Description | Selected |
|---|---|---|
| Yes — one-click approve from draft | ready_for_review stays valid when needed but not enforced | ✓ |
| No — must pass through ready_for_review | Enforces visible review every month | |

**User's choice:** Yes — one-click approve from draft (recommended)

### Can approved/sent be reverted?

| Option | Description | Selected |
|---|---|---|
| Yes — coach can revert to draft | Preserves snapshot_data for audit | ✓ |
| No — sent is terminal | Simpler code, painful for corrections | |

**User's choice:** Yes — coach can revert (recommended)

### Does the client see the status pill?

| Option | Description | Selected |
|---|---|---|
| Yes — read-only pill visible | Client sees "Sent [date]", no buttons | ✓ |
| No — status is coach-only UI | Cleaner client view, tighter separation | |
| You decide | Defer to planning | |

**User's choice:** Yes — read-only pill visible (recommended)

---

## Area 2: Email delivery (re-framed after Make→Resend pivot)

### Which transactional email provider?

| Option | Description | Selected |
|---|---|---|
| Resend | Next.js/Vercel fit, React Email support, $20 for 3k emails/mo | ✓ |
| Postmark | Best-in-class deliverability, $15/mo for 10k emails | |
| Amazon SES | Cheapest at volume, more setup | |
| You decide | Defer to planning | |

**User's choice:** Resend (recommended)

### What does the email contain?

| Option | Description | Selected |
|---|---|---|
| Link + brief summary (numbers + AI sentence) | Headline numbers + button + PDF attachment | |
| PDF attachment only | Familiar Calxa feel, file size concerns | |
| Both — link + PDF | Belt-and-braces | ✓ |
| You decide | Defer | |

**User's choice:** Both — link + PDF attachment

### Who receives the email?

| Option | Description | Selected |
|---|---|---|
| Primary business owner only | TO: businesses.owner_email | ✓ |
| Owner + coach BCC | Coach silently copied | |
| All business users + coach BCC | Larger client teams | |
| Coach chooses per send | Recipient picker in approve dialog | |

**User's choice:** Primary owner only (recommended)

### Bounce + failure handling?

| Option | Description | Selected |
|---|---|---|
| Sync send + cfo_email_log audit | Await Resend response, log every attempt | ✓ |
| Sync send + log + async bounce webhook | Above plus /api/webhooks/resend for async bounces | |
| Fire-and-forget, no audit table | Rely on Resend dashboard for diagnostics | |

**User's choice:** Sync send + cfo_email_log audit (recommended)

---

## Area 3: Edit-after-approval

### Edit policy on approved/sent reports?

| Option | Description | Selected |
|---|---|---|
| Allow edits, auto-revert to draft | Silent revert, snapshot preserved | ✓ |
| Lock read-only after approval | Strictest, most friction | |
| Warn with modal, no revert | Coach view diverges from client view | |

**User's choice:** Allow edits, auto-revert to draft (recommended)

### What counts as "an edit"?

| Option | Description | Selected |
|---|---|---|
| Commentary + section toggles + template | Coach-initiated changes only | ✓ |
| Any data change including Xero refresh | Most strict, very chatty | |
| Commentary only | Narrowest | |

**User's choice:** Commentary + section toggles + template (recommended)

### Revert trigger — with or without confirmation?

| Option | Description | Selected |
|---|---|---|
| Automatic, silent | Pill updates immediately on save | ✓ |
| Confirm modal | Explicit consent each edit | |
| Warning banner, revert at save | Less aggressive | |

**User's choice:** Automatic, silent (recommended)

---

## Area 4: Report URL in the email

### Which URL goes in the email now (pre-Phase 36)?

| Option | Description | Selected |
|---|---|---|
| Token-signed /reports/view/[token] | New public read-only route, snapshot_data rendering | ✓ |
| Coach URL /finances/monthly-report | Client can't access without coach login | |
| Portal URL /portal/[slug] (Phase 36) | Blocked on Phase 36 — would ship broken links | |
| PDF attachment only, no link | Simpler but loses live view | |

**User's choice:** Token-signed snapshot view (recommended)

### Token TTL?

| Option | Description | Selected |
|---|---|---|
| 90 days | Handles "reopened months later" cases | |
| 30 days | Tighter security | |
| Forever (no expiry) | Simplest UX, leaked links live forever | ✓ |
| You decide | Defer | |

**User's choice:** Forever — no expiry
**Notes:** User accepted the leak-risk tradeoff explicitly. Mitigation is global secret rotation if needed.

### Phase 36 forward-compat?

| Option | Description | Selected |
|---|---|---|
| Yes — switch to portal URL when portal_slug is set | Helper prefers portal, falls back to token | ✓ |
| No — keep token URL permanently | Portal accessed via login only | |

**User's choice:** Yes — switch to portal URL when Phase 36 ships (recommended)

---

## Area 5: Subject line + email copy + sender

### Subject line format?

| Option | Description | Selected |
|---|---|---|
| `{Business} — {Month Year} financial report` | Predictable, searchable | ✓ |
| Dynamic headline with key insight | Better open rates, risk of alarmist copy | |
| "Your {Month Year} report is ready" | Generic | |
| You decide | Defer | |

**User's choice:** `{Business} — {Month Year} financial report` (recommended)

### Email body?

| Option | Description | Selected |
|---|---|---|
| Greeting + 3 numbers + AI narrative + button | Scannable, reuses Phase 12b AI | |
| Greeting + button + PDF, no numbers | Minimal | ✓ |
| Numbers only, no AI narrative | Safer than AI sentence | |
| Coach custom note per send | Most personal, most friction | |

**User's choice:** Greeting + button + PDF, no numbers
**Notes:** User opted against embedding numbers in the body — PDF does the talking, email is just the delivery wrapper.

### From + reply-to?

| Option | Description | Selected |
|---|---|---|
| From reports@wisdombi.ai, Reply-To coach email | Single verified sender, personal replies | |
| From coach email directly | Most personal, per-coach Resend verification needed | ✓ |
| From reports@wisdombi.ai, Reply-To no-reply | No human replies | |

**User's choice:** From coach email directly
**Notes:** Implication — each coach needs Resend sender verification before their first send. Initial rollout covers Matt only; additional coaches verify on onboarding.

---

## Claude's Discretion

- Exact UI pill component styling (reuse existing patterns)
- Snapshot payload shape (minimum fields to render read-only view)
- Two-button vs split-button for "Mark Ready" + "Approve & Send"
- PDF attachment filename format
- Error toast copy
- Exact logging detail beyond `cfo_email_log` schema in D-14

## Deferred Ideas

- AI narrative in email body (Phase 24 hook)
- Dynamic subject line with insight
- Coach custom note per send
- Bulk approve on /cfo dashboard
- Async Resend bounce webhook
- Per-business token revocation
- Multi-recipient support
- Client sign-off workflow
