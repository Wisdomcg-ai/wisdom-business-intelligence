/**
 * Quarterly-review readiness audit (READ-ONLY).
 *
 * Run before a round of quarterly review workshops to spot clients who are missing
 * the data the workshop needs — so nobody hits a blank scorecard / empty KPI list
 * mid-session. Reports, per coached client:
 *   - has financial goals + year_type
 *   - has a target for the quarter being REVIEWED (q4 this cycle) or an annual target
 *   - has KPIs (else the KPI screens are empty)
 *   - has rocks/initiatives for the reviewed quarter (else "no previous rocks")
 *
 * Usage: node scripts/audit-quarterly-readiness.mjs
 *
 * This cycle reviews Q4 FY26 and plans Q1 FY27. Change REVIEWED_QUARTER / PLANNED_QUARTER
 * for a different cycle.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');

const REVIEWED_QUARTER = 'q4'; // quarter being reviewed this cycle (Q4 FY26)
const PLANNED_QUARTER = 'q1';  // quarter being planned this cycle (Q1 FY27)

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const [businesses, profiles, goals, kpis, inits] = await Promise.all([
  get('businesses?select=id,owner_id,assigned_coach_id'),
  get('business_profiles?select=id,user_id,business_name'),
  get('business_financial_goals?select=business_id,year_type,quarterly_targets,revenue_year1'),
  get('business_kpis?select=business_id'),
  get('strategic_initiatives?select=business_id,step_type'),
]);

const coachedOwner = new Set(businesses.filter((b) => b.assigned_coach_id).map((b) => b.owner_id));
const goalsByProfile = new Map(goals.map((g) => [String(g.business_id), g]));
const kpiCount = (pid) => kpis.filter((k) => String(k.business_id) === String(pid)).length;
const rockCount = (pid, q) => inits.filter((i) => String(i.business_id) === String(pid) && i.step_type === q).length;

const rows = profiles
  .filter((p) => p.user_id && coachedOwner.has(p.user_id))
  // Skip fully-empty businesses (no goals, KPIs or rocks) — these are test/inactive,
  // not real workshop clients.
  .filter((p) => goalsByProfile.has(String(p.id)) || kpiCount(p.id) > 0 || rockCount(p.id, REVIEWED_QUARTER) > 0)
  .map((p) => {
    const g = goalsByProfile.get(String(p.id));
    const qTargets = g?.quarterly_targets?.revenue || {};
    const hasReviewedTarget = !!qTargets[REVIEWED_QUARTER];
    const hasAnnual = Number(g?.revenue_year1 || 0) > 0;
    const nKpis = kpiCount(p.id);
    const nRocks = rockCount(p.id, REVIEWED_QUARTER);
    const ready = !!g && (hasReviewedTarget || hasAnnual) && nKpis > 0 && nRocks > 0;
    return {
      client: p.business_name,
      goals: g ? (g.year_type || '??') : '—',
      target: hasReviewedTarget ? REVIEWED_QUARTER.toUpperCase() : hasAnnual ? 'annual÷4' : '—',
      kpis: nKpis,
      rocks: nRocks,
      status: ready ? '✅ ready' : '⚠️ gaps',
    };
  })
  .sort((a, b) => (a.status === b.status ? a.client.localeCompare(b.client) : a.status < b.status ? 1 : -1));

console.log(`\nQuarterly-review readiness — reviewing ${REVIEWED_QUARTER.toUpperCase()}, planning ${PLANNED_QUARTER.toUpperCase()}\n`);
console.table(rows);

const gaps = rows.filter((r) => r.status.startsWith('⚠️'));
console.log(`\n${rows.length} coached clients — ${rows.length - gaps.length} ready, ${gaps.length} with gaps.`);
if (gaps.length) {
  console.log('Fix before their session:');
  for (const r of gaps) {
    const missing = [];
    if (r.goals === '—') missing.push('no financial goals');
    if (r.target === '—') missing.push('no reviewed-quarter or annual target');
    if (r.kpis === 0) missing.push('no KPIs');
    if (r.rocks === 0) missing.push('no reviewed-quarter rocks');
    console.log(`  • ${r.client}: ${missing.join(', ')}`);
  }
}
