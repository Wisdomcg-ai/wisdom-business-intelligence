#!/usr/bin/env node
/**
 * Phase 68 Plan 08 — Armstrong plan_snapshots baseline.
 *
 * MUST run AFTER 68-02 through 68-07 have all applied. Composes a full
 * OnePagePlanData payload from Armstrong's current DB state and inserts
 * a single 'goals_wizard_complete' baseline snapshot.
 *
 * SCHEMA NOTES (from prior plans + 68-01 snapshot):
 *   - strategy_data filtered by user_id (business_id null on row).
 *   - swot_items uses `title` (not `content`) and SINGULAR category values
 *     (strength/weakness/opportunity/threat).
 *   - business_kpis lives under businesses.id (a0bf1b0a-…), not
 *     business_profiles.id.
 *   - strategic_initiatives quarter assignments are stored as separate
 *     rows with step_type='q1'/'q2'/'q3'/'q4' (Option 3 hybrid in 68-02).
 *     We treat twelve_month rows as canonical and overlay the quarter
 *     step_type rows by title match to derive `quarters[]`.
 *   - plan_snapshots.business_id presumed to be business_profiles.id
 *     per PLAN's interface block. If the insert fails on FK, fall back
 *     to businesses.id.
 *
 * Idempotency: existence-check by (business_id, label). Re-running with
 * --apply once it exists logs "already exists" and exits 0.
 *
 * Run:
 *   node scripts/68-08-armstrong-plan-snapshot-baseline.mjs           # dry-run
 *   node scripts/68-08-armstrong-plan-snapshot-baseline.mjs --apply   # writes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const APPLY = process.argv.includes('--apply');

const BUSINESSES_ID        = 'a0bf1b0a-663e-4636-8c0d-eef62972dcbc';
const BUSINESS_PROFILES_ID = '678ae542-7f0b-43d1-8784-e7341767c250';
const USER_ID              = 'f4702002-69a6-44f1-b963-ada2a95c843b';
const SWOT_ANALYSES_ID     = 'cb6d1358-a0ec-48b8-878c-159df6b3a576';
const LABEL                = 'Post 2026-05-12 session refresh';

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function apiGet(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function apiInsert(table, payload) {
  const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`POST ${table} → ${r.status} ${await r.text()}`);
  return r.json();
}

console.log('=== Phase 68 Plan 08 — Armstrong plan_snapshots baseline ===\n');
console.log('Mode:', APPLY ? '\x1b[31m--apply (WILL WRITE)\x1b[0m' : '\x1b[33mDRY-RUN (no write)\x1b[0m');
console.log('Tenant: business_profiles.id =', BUSINESS_PROFILES_ID);
console.log('Label:', LABEL);
console.log('');

// ─── Idempotency check ───────────────────────────────────────────────────────
const existingByProfile = await apiGet(`plan_snapshots?business_id=eq.${BUSINESS_PROFILES_ID}&label=eq.${encodeURIComponent(LABEL)}&select=id,version_number,business_id`);
const existingByBiz     = await apiGet(`plan_snapshots?business_id=eq.${BUSINESSES_ID}&label=eq.${encodeURIComponent(LABEL)}&select=id,version_number,business_id`);
const existing = [...existingByProfile, ...existingByBiz];

if (existing.length > 0) {
  console.log(`\x1b[32m✓ Baseline snapshot already exists:\x1b[0m`);
  for (const e of existing) console.log(`    id=${e.id} version=${e.version_number} business_id=${e.business_id}`);
  console.log('(idempotent — skipping)');
  process.exit(0);
}

// ─── Gather source rows ──────────────────────────────────────────────────────
const [
  strategyRows,
  finRows,
  kpiRows,
  initiatives,
  swotItems,
  profileRows,
  bizRows,
  snapshotsAll,
] = await Promise.all([
  apiGet(`strategy_data?user_id=eq.${USER_ID}&select=vision_mission`),
  apiGet(`business_financial_goals?business_id=eq.${BUSINESS_PROFILES_ID}&select=*`),
  apiGet(`business_kpis?business_id=eq.${BUSINESSES_ID}&is_active=eq.true&select=name,category,year1_target,year2_target,year3_target`),
  apiGet(`strategic_initiatives?business_id=eq.${BUSINESS_PROFILES_ID}&select=title,step_type,quarter_assigned,assigned_to`),
  apiGet(`swot_items?swot_analysis_id=eq.${SWOT_ANALYSES_ID}&select=category,title`),
  apiGet(`business_profiles?id=eq.${BUSINESS_PROFILES_ID}&select=company_name,owner_info`),
  apiGet(`businesses?id=eq.${BUSINESSES_ID}&select=name`),
  apiGet(`plan_snapshots?or=(business_id.eq.${BUSINESS_PROFILES_ID},business_id.eq.${BUSINESSES_ID})&select=version_number&order=version_number.desc&limit=1`),
]);

const vm = strategyRows?.[0]?.vision_mission || {};
const fin = finRows?.[0] || {};
const profile = profileRows?.[0] || {};
const biz = bizRows?.[0] || {};
const ownerInfo = profile.owner_info || {};

// ─── Compose strategic initiatives with quarter overlay ──────────────────────
const norm = (s) => (s || '').trim().toLowerCase();
const twelveMonth = initiatives.filter((i) => i.step_type === 'twelve_month');
const quarterRows = initiatives.filter((i) => ['q1', 'q2', 'q3', 'q4'].includes(i.step_type));

// For each twelve_month title, collect quarters where the same title appears in q1-q4 step_type rows.
const quartersByTitle = new Map();
for (const q of quarterRows) {
  const t = norm(q.title);
  if (!quartersByTitle.has(t)) quartersByTitle.set(t, []);
  quartersByTitle.get(t).push(q.step_type.toUpperCase());
}

const strategicInitiatives = twelveMonth.map((i) => ({
  title: i.title,
  quarters: quartersByTitle.get(norm(i.title)) || [],
  owner: i.assigned_to || undefined,
}));

// ─── Compose SWOT arrays (note: singular category names + `title` field) ──────
const swotFor = (cat) =>
  swotItems.filter((s) => s.category === cat).map((s) => s.title);

// ─── Compose financialGoals (Y3/Y2/Y1 + quarter using *_current) ─────────────
const fg = {
  year3: { revenue: fin.revenue_year3 ?? 0, grossProfit: fin.gross_profit_year3 ?? 0, netProfit: fin.net_profit_year3 ?? 0 },
  year2: { revenue: fin.revenue_year2 ?? 0, grossProfit: fin.gross_profit_year2 ?? 0, netProfit: fin.net_profit_year2 ?? 0 },
  year1: { revenue: fin.revenue_year1 ?? 0, grossProfit: fin.gross_profit_year1 ?? 0, netProfit: fin.net_profit_year1 ?? 0 },
  quarter: { revenue: fin.revenue_current ?? 0, grossProfit: fin.gross_profit_current ?? 0, netProfit: fin.net_profit_current ?? 0 },
};

// ─── Compose coreMetrics (sourced entirely from business_financial_goals) ─────
const cm = {
  year3: {
    leadsPerMonth:        fin.leads_per_month_year3 ?? null,
    conversionRate:       fin.conversion_rate_year3 ?? null,
    avgTransactionValue:  fin.avg_transaction_value_year3 ?? null,
    teamHeadcount:        fin.team_headcount_year3 ?? null,
    ownerHoursPerWeek:    fin.owner_hours_per_week_year3 ?? null,
  },
  year2: {
    leadsPerMonth:        fin.leads_per_month_year2 ?? null,
    conversionRate:       fin.conversion_rate_year2 ?? null,
    avgTransactionValue:  fin.avg_transaction_value_year2 ?? null,
    teamHeadcount:        fin.team_headcount_year2 ?? null,
    ownerHoursPerWeek:    fin.owner_hours_per_week_year2 ?? null,
  },
  year1: {
    leadsPerMonth:        fin.leads_per_month_year1 ?? null,
    conversionRate:       fin.conversion_rate_year1 ?? null,
    avgTransactionValue:  fin.avg_transaction_value_year1 ?? null,
    teamHeadcount:        fin.team_headcount_year1 ?? null,
    ownerHoursPerWeek:    fin.owner_hours_per_week_year1 ?? null,
  },
  quarter: {
    leadsPerMonth:        fin.leads_per_month_current ?? null,
    conversionRate:       fin.conversion_rate_current ?? null,
    avgTransactionValue:  fin.avg_transaction_value_current ?? null,
    teamHeadcount:        fin.team_headcount_current ?? null,
    ownerHoursPerWeek:    fin.owner_hours_per_week_current ?? null,
  },
};

// ─── Compose kpis ────────────────────────────────────────────────────────────
const kpis = kpiRows.map((k) => ({
  name: k.name,
  category: k.category,
  year3Target: k.year3_target ?? 0,
  year1Target: k.year1_target ?? 0,
  quarterTarget: 0,
}));

// ─── Compose ownerGoals ──────────────────────────────────────────────────────
const ownerGoals = {
  desiredHoursPerWeek: ownerInfo.desired_hours ?? null,
  currentHoursPerWeek: ownerInfo.current_hours ?? null,
  primaryGoal:         ownerInfo.primary_goal ?? '',
  timeHorizon:         ownerInfo.time_horizon ?? '',
  exitStrategy:        ownerInfo.exit_strategy ?? '',
};

// ─── Assemble full OnePagePlanData ───────────────────────────────────────────
const planData = {
  vision:                vm.vision_statement || '',
  mission:               vm.mission_statement || '',
  coreValues:            Array.isArray(vm.core_values) ? vm.core_values : [],
  strengths:             swotFor('strength'),
  weaknesses:            swotFor('weakness'),
  opportunities:         swotFor('opportunity'),
  threats:               swotFor('threat'),
  financialGoals:        fg,
  coreMetrics:           cm,
  kpis,
  strategicInitiatives,
  quarterlyRocks:        [],
  currentQuarter:        'q4',
  currentQuarterLabel:   'Pre-FY27 — Q4 FY26 (Apr-Jun 2026)',
  yearType:              'FY',
  planYear:              2027,
  companyName:           biz.name || profile.company_name || '',
  ownerGoals,
};

// ─── Compute next version ────────────────────────────────────────────────────
const nextVersion = (snapshotsAll?.[0]?.version_number || 0) + 1;

// ─── Build snapshot payload ──────────────────────────────────────────────────
const payload = {
  business_id:       BUSINESS_PROFILES_ID,
  user_id:           USER_ID,
  snapshot_type:     'goals_wizard_complete',
  version_number:    nextVersion,
  label:             LABEL,
  plan_data:         planData,
};

console.log('--- Composed plan_data summary ---');
console.log(`  vision:                ${planData.vision.length > 0 ? planData.vision.slice(0, 60) + (planData.vision.length > 60 ? '…' : '') : '(empty)'}`);
console.log(`  mission:               ${planData.mission.length > 0 ? planData.mission.slice(0, 60) + '…' : '(empty)'}`);
console.log(`  coreValues:            ${planData.coreValues.length} items`);
console.log(`  strengths:             ${planData.strengths.length} items`);
console.log(`  weaknesses:            ${planData.weaknesses.length} items`);
console.log(`  opportunities:         ${planData.opportunities.length} items`);
console.log(`  threats:               ${planData.threats.length} items`);
console.log(`  financialGoals.year1:  revenue=$${planData.financialGoals.year1.revenue.toLocaleString()} GP=$${planData.financialGoals.year1.grossProfit.toLocaleString()} NP=$${planData.financialGoals.year1.netProfit.toLocaleString()}`);
console.log(`  coreMetrics.year1:     leads=${cm.year1.leadsPerMonth}/mo conv=${cm.year1.conversionRate}% avg=$${(cm.year1.avgTransactionValue || 0).toLocaleString()} team=${cm.year1.teamHeadcount} owner_hrs=${cm.year1.ownerHoursPerWeek}`);
console.log(`  kpis:                  ${planData.kpis.length} items`);
console.log(`  strategicInitiatives:  ${planData.strategicInitiatives.length} items (${planData.strategicInitiatives.filter(i => i.quarters.length > 0).length} with quarter assignments)`);
console.log(`  companyName:           ${planData.companyName}`);
console.log(`  ownerGoals:            desiredHours=${ownerGoals.desiredHoursPerWeek} primaryGoal="${ownerGoals.primaryGoal}"`);
console.log('');
console.log(`Snapshot payload: version_number=${nextVersion} snapshot_type='goals_wizard_complete'`);

if (!APPLY) {
  console.log('\n\x1b[33mDRY RUN — re-run with --apply to execute.\x1b[0m');
  process.exit(0);
}

console.log('\nInserting...');
const inserted = await apiInsert('plan_snapshots', payload);
console.log(`\x1b[32m✓ Snapshot inserted: id=${inserted[0].id} version=${inserted[0].version_number}\x1b[0m`);
