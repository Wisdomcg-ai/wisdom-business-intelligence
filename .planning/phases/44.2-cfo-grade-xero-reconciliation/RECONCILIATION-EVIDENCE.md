# Phase 44.2 — Reconciliation Evidence (Gate 5: Web Parity)

Manual web-parity evidence per (tenant, month). Operator-filled during 06E
Task 5. **All deltas must be 0.00.** Anything non-zero drops into triage —
likely a parser or classification issue the automated gates 1–4 didn't catch.

## How to fill

For each row:
1. Open Xero web → Reports → run the relevant report (P&L for FY-to-month, BS for month-end, TB for month-end).
2. Find the spot-check account; copy the value from Xero PDF.
3. Query our DB for the same account at the same date (SQL templates below).
4. Record both values + delta. Add the Xero PDF link or page reference in Notes.

### SQL templates

```sql
-- PL (FY-to-month YTD) for a given account_code:
SELECT account_name, SUM(amount) AS ytd_total
FROM xero_pl_lines
WHERE business_id = '<profile_id>'
  AND tenant_id = '<tenant_id>'
  AND account_code = '<code>'
  AND period_month <= '<month-end>'
GROUP BY account_name;

-- BS (point-in-time) for a given account_code:
SELECT account_name, balance
FROM xero_bs_lines
WHERE business_id = '<profile_id>'
  AND tenant_id = '<tenant_id>'
  AND account_code = '<code>'
  AND balance_date = '<month-end>';

-- TB: gate 3 ensures Σ debit == Σ credit; spot-check by picking the
-- top-debit and top-credit account from the Xero TB PDF and verifying both
-- match what xero_pl_lines + xero_bs_lines aggregate to for that date.
```

---

## JDS — Just Digital Signage / Aeris Solutions Trust

`business_id: 900aa935-ae8c-4913-baf7-169260fa19ef` · `tenant_id: 0219d3a9-...` · AUD · FY end Jun

### 2026-02-28
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | Sales - Hardware                       |   |   |   |   |
| BS   | NAB Bank / Cheque A/C                  |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

### 2026-03-31
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | Sales - Hardware                       |   |   |   |   |
| BS   | NAB Bank / Cheque A/C                  |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

### 2026-04-30
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | Sales - Hardware                       |   |   |   |   |
| BS   | NAB Bank / Cheque A/C                  |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

---

## Envisage — Malouf Family Trust

`business_id: <TBD>` · `tenant_id: 04d9df1f-...` · AUD · FY end Jun

### 2026-02-28
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | (revenue spot-check)                   |   |   |   |   |
| BS   | (top asset)                            |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

### 2026-03-31
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | (revenue spot-check)                   |   |   |   |   |
| BS   | (top asset)                            |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

### 2026-04-30
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | (revenue spot-check)                   |   |   |   |   |
| BS   | (top asset)                            |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

---

## IICT-HK — IICT Hong Kong subsidiary

`business_id: <TBD>` · `tenant_id: <HK_TENANT_ID>` · HKD · FX coverage

### 2026-02-28
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | (revenue spot-check)                   |   |   |   |   |
| BS   | (top asset)                            |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

### 2026-03-31
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | (revenue spot-check)                   |   |   |   |   |
| BS   | (top asset)                            |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

### 2026-04-30
| Gate | Account | Xero PDF | Our DB | Delta | Notes |
|------|---------|---------:|-------:|------:|-------|
| PL   | (revenue spot-check)                   |   |   |   |   |
| BS   | (top asset)                            |   |   |   |   |
| TB   | (highest debit account)                |   |   |   |   |

---

## Sign-off

Once all 27 rows above show `Delta = 0.00`:

> **Phase 44.2 06E Gate 5 — verified.** All 27 spot-checks across 3 tenants × 3 month-ends match Xero web to the cent. WisdomBI numbers reconcile to Xero.

Operator: ____________________   Date: ____________________
