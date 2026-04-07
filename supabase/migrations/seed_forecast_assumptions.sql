-- ============================================================
-- UPDATE FORECAST ASSUMPTIONS FOR DEMO (wizard-format)
-- Run in Supabase SQL Editor AFTER seed_demo_account.sql
-- Then clear browser localStorage and hard refresh
-- ============================================================
-- Story: Precision Electrical Group
--   Y1 (FY2026): $3.27M revenue, 45% GP, ~13% NP = $430K profit
--   Y2 (FY2027): $4.04M revenue, 45% GP, ~15% NP = $620K profit
--   Y3 (FY2028): $4.68M revenue, 45% GP, ~16% NP = $740K profit
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := '791ce5cf-3998-4161-9f81-7a2440c618af';
  v_business_id TEXT := '3c4b8270-5005-440f-98fe-522d752f4fcd';
  v_profile_id TEXT;
  v_forecast_id UUID;
BEGIN

-- Find the profile ID (used as business_id in some tables)
SELECT id::text INTO v_profile_id
FROM business_profiles
WHERE business_id = v_business_id
LIMIT 1;

IF v_profile_id IS NULL THEN
  RAISE EXCEPTION 'No business_profiles found for business_id %', v_business_id;
END IF;

-- Find the forecast
SELECT id INTO v_forecast_id
FROM financial_forecasts
WHERE (business_id = v_profile_id OR business_id = v_business_id)
  AND fiscal_year = 2026
  AND is_active = true
LIMIT 1;

IF v_forecast_id IS NULL THEN
  RAISE EXCEPTION 'No active FY2026 forecast found';
END IF;

RAISE NOTICE 'Updating forecast % with wizard assumptions', v_forecast_id;

-- ============================================================
-- 1. UPDATE FORECAST ASSUMPTIONS (wizard-format JSONB)
-- ============================================================
UPDATE financial_forecasts
SET assumptions = '{
  "version": 1,
  "createdAt": "2026-01-15T00:00:00.000Z",
  "updatedAt": "2026-03-19T00:00:00.000Z",
  "industry": "Electrical Contracting & Services",
  "employeeCount": 15,
  "fiscalYearStart": "07",

  "goals": {
    "year1": {"revenue": 3400000, "grossProfitPct": 45, "netProfitPct": 13},
    "year2": {"revenue": 4500000, "grossProfitPct": 47, "netProfitPct": 15},
    "year3": {"revenue": 5500000, "grossProfitPct": 48, "netProfitPct": 18}
  },

  "revenue": {
    "lines": [
      {
        "accountId": "rev-residential",
        "accountName": "Residential & Emergency",
        "priorYearTotal": 1153000,
        "growthType": "percentage",
        "growthPct": 33.2,
        "year1Monthly": {
          "2025-07": 102000, "2025-08": 109000, "2025-09": 121000,
          "2025-10": 131000, "2025-11": 139000, "2025-12": 123000,
          "2026-01": 106000, "2026-02": 123000, "2026-03": 136000,
          "2026-04": 148000, "2026-05": 155000, "2026-06": 143000
        },
        "year2Quarterly": {"q1": 388000, "q2": 453000, "q3": 425000, "q4": 485000},
        "year3Quarterly": {"q1": 427000, "q2": 498000, "q3": 468000, "q4": 533000}
      },
      {
        "accountId": "rev-commercial",
        "accountName": "Commercial & Maintenance",
        "priorYearTotal": 948000,
        "growthType": "percentage",
        "growthPct": 20.7,
        "year1Monthly": {
          "2025-07": 76000, "2025-08": 81000, "2025-09": 90000,
          "2025-10": 97000, "2025-11": 103000, "2025-12": 92000,
          "2026-01": 79000, "2026-02": 92000, "2026-03": 101000,
          "2026-04": 110000, "2026-05": 116000, "2026-06": 107000
        },
        "year2Quarterly": {"q1": 330000, "q2": 385000, "q3": 361000, "q4": 411000},
        "year3Quarterly": {"q1": 389000, "q2": 454000, "q3": 426000, "q4": 486000}
      },
      {
        "accountId": "rev-solar",
        "accountName": "Solar, Battery & EV",
        "priorYearTotal": 500000,
        "growthType": "percentage",
        "growthPct": 18.0,
        "year1Monthly": {
          "2025-07": 40000, "2025-08": 42000, "2025-09": 47000,
          "2025-10": 50000, "2025-11": 53000, "2025-12": 47000,
          "2026-01": 40000, "2026-02": 47000, "2026-03": 53000,
          "2026-04": 57000, "2026-05": 59000, "2026-06": 55000
        },
        "year2Quarterly": {"q1": 177000, "q2": 206000, "q3": 194000, "q4": 220000},
        "year3Quarterly": {"q1": 221000, "q2": 258000, "q3": 242000, "q4": 275000}
      }
    ],
    "seasonalityPattern": [7.0, 7.3, 7.9, 8.5, 9.2, 8.2, 7.5, 8.1, 8.7, 9.2, 9.5, 9.0],
    "seasonalitySource": "calculated"
  },

  "cogs": {
    "lines": [
      {
        "accountId": "cogs-materials",
        "accountName": "Materials & Supplies",
        "priorYearTotal": 598000,
        "costBehavior": "variable",
        "percentOfRevenue": 23,
        "notes": "Bulk purchasing deals improving from 25% to 23%"
      },
      {
        "accountId": "cogs-labour",
        "accountName": "Direct Labour - Field Staff",
        "priorYearTotal": 572000,
        "costBehavior": "variable",
        "percentOfRevenue": 22,
        "notes": "8 field electricians + 1 apprentice. Includes super."
      },
      {
        "accountId": "cogs-subcontractors",
        "accountName": "Subcontractors",
        "priorYearTotal": 104000,
        "costBehavior": "variable",
        "percentOfRevenue": 4,
        "notes": "Specialist subs for solar installs and large commercial jobs"
      },
      {
        "accountId": "cogs-vehicle",
        "accountName": "Vehicle & Equipment Costs",
        "priorYearTotal": 156000,
        "costBehavior": "variable",
        "percentOfRevenue": 6,
        "notes": "Fleet running costs, tool replacements, PPE"
      }
    ]
  },

  "team": {
    "existingTeam": [
      {
        "employeeId": "emp-james",
        "name": "James Mitchell",
        "role": "Owner / Director",
        "employmentType": "full-time",
        "currentSalary": 204000,
        "hoursPerWeek": 45,
        "salaryIncreasePct": 3,
        "includeInForecast": true,
        "isFromXero": false
      },
      {
        "employeeId": "emp-sarah",
        "name": "Sarah Chen",
        "role": "Office Manager",
        "employmentType": "full-time",
        "currentSalary": 75000,
        "hoursPerWeek": 38,
        "salaryIncreasePct": 3,
        "includeInForecast": true,
        "isFromXero": false
      },
      {
        "employeeId": "emp-amy",
        "name": "Amy Watson",
        "role": "Admin Assistant",
        "employmentType": "part-time",
        "currentSalary": 52000,
        "hoursPerWeek": 30,
        "salaryIncreasePct": 3,
        "includeInForecast": true,
        "isFromXero": false
      }
    ],
    "plannedHires": [
      {
        "id": "hire-sales-mgr",
        "role": "Sales Manager",
        "employmentType": "full-time",
        "salary": 110000,
        "hoursPerWeek": 40,
        "startMonth": "2026-04"
      },
      {
        "id": "hire-project-coord",
        "role": "Project Coordinator",
        "employmentType": "full-time",
        "salary": 70000,
        "hoursPerWeek": 38,
        "startMonth": "2027-01"
      }
    ],
    "departures": [],
    "bonuses": [],
    "commissions": [],
    "superannuationPct": 11.5,
    "workCoverPct": 0,
    "payrollTaxPct": 0
  },

  "opex": {
    "lines": [
      {
        "accountId": "opex-rent",
        "accountName": "Rent, Insurance & Utilities",
        "priorYearTotal": 189000,
        "costBehavior": "fixed",
        "monthlyAmount": 16500,
        "annualIncreasePct": 3,
        "notes": "Brendale workshop lease + workers comp + public liability"
      },
      {
        "accountId": "opex-marketing",
        "accountName": "Marketing & Advertising",
        "priorYearTotal": 78000,
        "costBehavior": "fixed",
        "monthlyAmount": 10000,
        "annualIncreasePct": 3,
        "notes": "Google Ads $3K/mo + agency retainer + collateral"
      },
      {
        "accountId": "opex-it",
        "accountName": "IT, Software & Communications",
        "priorYearTotal": 50000,
        "costBehavior": "fixed",
        "monthlyAmount": 7000,
        "annualIncreasePct": 3,
        "notes": "SimPRO $1.8K, Xero $250, Office 365, phones, internet"
      },
      {
        "accountId": "opex-office",
        "accountName": "Office & Consumables",
        "priorYearTotal": 28000,
        "costBehavior": "fixed",
        "monthlyAmount": 2500,
        "annualIncreasePct": 3
      },
      {
        "accountId": "opex-accounting",
        "accountName": "Accounting & Legal",
        "priorYearTotal": 38000,
        "costBehavior": "fixed",
        "monthlyAmount": 3500,
        "annualIncreasePct": 3,
        "notes": "BAS agent, annual audit, legal retainer"
      },
      {
        "accountId": "opex-licences",
        "accountName": "Licences & Compliance",
        "priorYearTotal": 32000,
        "costBehavior": "fixed",
        "monthlyAmount": 3000,
        "annualIncreasePct": 3,
        "notes": "Electrical licences, SafeWork NSW, vehicle rego"
      },
      {
        "accountId": "opex-phone",
        "accountName": "Phone & Internet",
        "priorYearTotal": 24000,
        "costBehavior": "fixed",
        "monthlyAmount": 2200,
        "annualIncreasePct": 3
      },
      {
        "accountId": "opex-training",
        "accountName": "Training & Development",
        "priorYearTotal": 15000,
        "costBehavior": "fixed",
        "monthlyAmount": 1500,
        "annualIncreasePct": 3,
        "notes": "CPD, safety training, apprentice TAFE"
      },
      {
        "accountId": "opex-vehicle-running",
        "accountName": "Vehicle Running & Fuel",
        "priorYearTotal": 20000,
        "costBehavior": "fixed",
        "monthlyAmount": 1800,
        "annualIncreasePct": 5,
        "notes": "Fleet fuel, tolls, parking"
      }
    ]
  },

  "capex": {
    "items": [
      {
        "id": "capex-van",
        "name": "New Service Vehicle (Van #8)",
        "amount": 65000,
        "month": "2026-04",
        "category": "equipment"
      },
      {
        "id": "capex-solar-equip",
        "name": "Solar Test Equipment",
        "amount": 18000,
        "month": "2026-01",
        "category": "equipment"
      }
    ]
  }
}'::jsonb
WHERE id = v_forecast_id;

RAISE NOTICE 'Updated forecast assumptions for %', v_forecast_id;

-- ============================================================
-- 2. UPDATE GOALS TO MATCH FORECAST TARGETS
-- ============================================================
UPDATE business_financial_goals
SET
  revenue_year1 = 3400000,
  gross_margin_year1 = 45,
  net_margin_year1 = 13,
  revenue_year2 = 4500000,
  gross_margin_year2 = 47,
  net_margin_year2 = 15,
  revenue_year3 = 5500000,
  gross_margin_year3 = 48,
  net_margin_year3 = 18
WHERE business_id = v_business_id
   OR business_id = v_profile_id;

RAISE NOTICE 'Updated business financial goals';

-- ============================================================
-- 3. ADD estimated_cost TO STRATEGIC INITIATIVES (if missing)
-- ============================================================
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS is_monthly_cost BOOLEAN DEFAULT false;

UPDATE strategic_initiatives SET
  estimated_cost = CASE title
    WHEN 'Launch 24/7 Emergency Service' THEN 15000
    WHEN 'Deploy SimPRO Field Service Software' THEN 2500
    WHEN 'Hire Dedicated Sales Manager' THEN 120000
    WHEN 'Solar Division Expansion' THEN 45000
    WHEN 'Strata Maintenance Contracts Program' THEN 8000
    WHEN 'Website & Digital Marketing Overhaul' THEN 3500
    WHEN 'Apprenticeship Training Program' THEN 8000
    WHEN 'Commercial EV Charger Partnerships' THEN 25000
    ELSE estimated_cost
  END,
  is_monthly_cost = CASE title
    WHEN 'Deploy SimPRO Field Service Software' THEN true
    WHEN 'Website & Digital Marketing Overhaul' THEN true
    WHEN 'Apprenticeship Training Program' THEN true
    ELSE COALESCE(is_monthly_cost, false)
  END
WHERE user_id = v_user_id
  AND step_type = 'twelve_month';

RAISE NOTICE 'Updated strategic initiative costs';

-- ============================================================
-- DONE
-- ============================================================
RAISE NOTICE '============================================================';
RAISE NOTICE 'FORECAST ASSUMPTIONS UPDATED SUCCESSFULLY';
RAISE NOTICE '============================================================';
RAISE NOTICE 'Forecast ID: %', v_forecast_id;
RAISE NOTICE '';
RAISE NOTICE 'IMPORTANT: Clear browser localStorage to load fresh data:';
RAISE NOTICE '  Open browser console and run:';
RAISE NOTICE '  localStorage.removeItem("forecast-wizard-v4-" + location.hostname)';
RAISE NOTICE '  Or clear ALL localStorage: localStorage.clear()';
RAISE NOTICE '  Then hard refresh (Cmd+Shift+R)';
RAISE NOTICE '============================================================';

END $$;
