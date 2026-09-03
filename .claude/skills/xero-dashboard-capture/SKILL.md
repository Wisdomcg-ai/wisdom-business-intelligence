---
name: xero-dashboard-capture
description: Read the "Reconcile N items" badges off each Xero org's dashboard (Matt's logged-in Chrome session) and record them in WisdomBI as the banner-exact reconciliation count. Run on demand or before the monthly pack review. Xero's API cannot provide this number.
---

# Xero dashboard badge capture

## Why this exists
Xero API support confirmed (2 Sep 2026) that the Bank Statement report scope
is not granted to any app. The dashboard's **Reconcile N items** badge counts
uncoded bank-feed statement lines that no accounting-API surface exposes, so
WisdomBI's API count (recorded transactions) is a floor. This routine records
the badge itself, per org, as a separate source the CFO board shows beside the
API count.

## Preconditions
- Matt is logged into Xero in Chrome (the Claude-in-Chrome browser, not Safari).
  If `go.xero.com` redirects to the login page, STOP and ask Matt to log in —
  never type credentials.
- Matt is logged into WisdomBI in the same Chrome (the POST rides his session).

## Org → WisdomBI mapping
The WisdomBI business + tenant_id for each Xero org (active connections):

| Xero org | WisdomBI business | tenant_id |
|---|---|---|
| Armstrong & Co Projects Pty Ltd | Armstrong & Co | 432fdb49-69c8-4255-be57-fbb5020d2b91 |
| Attaquer Pty Ltd | Attaquer | e3671ec1-df04-4efd-88be-766df080257b |
| Digital Bond Marketing Pty Ltd | Digital Bond | 79ff0f69-4ea9-4de8-82a8-e26decb050fc |
| Dragon Roofing Pty Ltd | Dragon Roofing | 42735fc3-21f2-4668-9783-93ce0f66f481 |
| EASY HAIL CLAIM PTY LTD | Dragon Roofing | 3b67e5b6-780c-4158-831c-82293f34ca04 |
| Malouf Family Trust | Envisage Australia Pty Ltd | 04d9df1f-53b0-4d1c-ba9e-4ce49b9c8860 |
| IICT (Aust) Pty Ltd | IICT Group | 1d83c9a4-bf6d-448f-bb87-88e2684317bf |
| IICT Group Limited | IICT Group | de943481-389d-4134-b0af-410f025f53c2 |
| IICT Group Pty Ltd | IICT Group | 44582ebf-ec15-414b-9f20-8706967257f3 |
| Aeris Solutions Pty Ltd | Just Digital Signage | 0219d3a9-c1be-4fb8-a4d3-0710b3af715a |
| Sharon King Hearing Centres Pty Ltd | Sharon King hearing | ed0ce44b-95f6-4849-b2b8-d62a04222c41 |
| Sydney Pressed Metal Pty Ltd | Sydney Pressed Metal | 1523a41b-4d1b-4c92-b903-ac3517d1eb33 |
| Urban Road Pty Ltd | Urban Road | 8519c134-ed81-4d9b-8f07-ce499d12b7ee |

If an org is missing here, look it up:
`select b.id, b.name, xc.tenant_name, xc.tenant_id from xero_connections xc join businesses b on b.id=xc.business_id where xc.is_active`.
The POST refuses a tenant_id that isn't an active connection of the business.

## Procedure (per org)
1. Open `https://go.xero.com/app/` in the Chrome tab. Switch org via the org
   name menu (top-left) → pick the org. Wait for the dashboard to load.
2. Read the bank account cards. Each card shows the account name and, when
   items are outstanding, a button/badge **"Reconcile N items"**. Cards with
   nothing outstanding show no badge — record 0 for them.
   - Use `find` for "Reconcile" to list badges, or `read_page` on the
     dashboard's bank-accounts region. Read the number from the badge text,
     never infer it.
   - Accounts hidden from the dashboard don't show — note that in `notes`.
3. Sum the badges → `total_count`. Keep the per-account list.
4. POST to WisdomBI from a WisdomBI tab (so cookies apply):
   ```js
   await fetch('/api/cfo/reconciliation/dashboard-capture', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       business_id: '<businesses.id>',
       captures: [{
         tenant_id: '<tenant_id>', total_count: 27, method: 'chrome_routine',
         accounts: [{ name: 'Westpac Cheque', count: 25 }, { name: 'Amex', count: 2 }],
         notes: null
       }]
     })
   }).then(r => r.json())
   ```
   A business with several orgs (Dragon, IICT) takes one POST with several
   captures. The accounts must sum to `total_count` or the POST is refused.
5. Move to the next org. At the end, report the table of org → badge count and
   any org that couldn't be read (login wall, dashboard layout changed).

## Honesty rules
- Never record a number you didn't read on screen. An unreadable org is
  reported, not zeroed.
- Record 0 only when the dashboard shows no badge on any card.
- The board labels these "Xero badge · <time>"; they never overwrite the API
  count — different populations.
