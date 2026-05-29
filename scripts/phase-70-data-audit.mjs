#!/usr/bin/env node
/**
 * Phase 70 — Data-health audit for production clients pre-Calxa cutover.
 *
 * READ-ONLY. No inserts/updates/deletes. Pure Supabase REST reads via supabase-js.
 *
 * Targets:
 *   - Envisage Australia Pty Ltd
 *   - Just Digital Signage  (JDS)
 *   - IICT Group            (multi-tenant: AU + AU + HK)
 *
 * Dual-ID convention (verified empirically — see SUMMARY at bottom):
 *   keyed by businesses.id          → xero_connections, subscription_budgets,
 *                                     monthly_report_snapshots
 *   keyed by business_profiles.id   → xero_pl_lines, xero_bs_lines,
 *                                     financial_forecasts (+ forecast_*)
 *
 * Run: node scripts/phase-70-data-audit.mjs
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const CLIENTS = [
  { label: 'Envisage',     business_id: '8c8c63b2-bdc4-4115-9375-8d0fd89acc00', business_profile_id: 'fa0a80e8-e58e-40aa-b34a-8db667d4b221' },
  { label: 'Just Digital', business_id: 'fea253dd-3dfa-447b-8f9b-8dff68aeac0a', business_profile_id: '900aa935-ae8c-4913-baf7-169260fa19ef' },
  { label: 'IICT',         business_id: 'fbc6dffd-677d-47ec-8277-7157982938e7', business_profile_id: '6c0dfadb-4229-4fc2-89eb-ec064d24511b' },
];

function pad(s, n) { return String(s).padEnd(n); }
function section(t) { console.log('\n' + '═'.repeat(78) + '\n' + t + '\n' + '═'.repeat(78)); }
function sub(t)     { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 75 - t.length))); }

function monthsBack(n) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

async function auditClient(c) {
  section(`CLIENT: ${c.label}   businesses.id=${c.business_id}   business_profiles.id=${c.business_profile_id}`);

  // ── (a) Identity ─────────────────────────────────────────────────────────
  sub('(a) Identity');
  const { data: biz, error: bizErr } = await sb.from('businesses').select('id,name,status,program_type,enabled_modules,owner_email,owner_name,is_cfo_client,consolidation_budget_mode,created_at').eq('id', c.business_id).maybeSingle();
  console.log('businesses:', bizErr ? `ERR ${bizErr.message}` : JSON.stringify(biz));
  const { data: bp, error: bpErr } = await sb.from('business_profiles').select('id,business_id,company_name,business_name,industry,fiscal_year_start,current_revenue,annual_revenue,gross_profit,net_profit,gross_profit_margin,net_profit_margin,cash_in_bank,employee_count,profile_completed').eq('id', c.business_profile_id).maybeSingle();
  console.log('business_profiles:', bpErr ? `ERR ${bpErr.message}` : JSON.stringify(bp));
  if (bp && biz) {
    if (bp.business_id !== c.business_id) console.log(`  ⚠ dual-ID drift: business_profiles.business_id=${bp.business_id} != businesses.id=${c.business_id}`);
    else console.log('  ✓ business_profiles.business_id matches businesses.id');
  }

  // ── (b) Xero sync state ──────────────────────────────────────────────────
  sub('(b) Xero sync state');
  const { data: conns } = await sb.from('xero_connections').select('tenant_id,tenant_name,functional_currency,include_in_consolidation,is_active,last_synced_at,token_refreshing_at,expires_at').eq('business_id', c.business_id).order('display_order', { ascending: true });
  console.log(`xero_connections (keyed by businesses.id): ${conns?.length ?? 0} row(s)`);
  for (const t of conns ?? []) {
    const expIso = t.expires_at ? new Date(t.expires_at).toISOString() : 'null';
    console.log(`  • ${pad(t.tenant_name, 32)} cur=${t.functional_currency} consol=${t.include_in_consolidation} active=${t.is_active} last_sync=${t.last_synced_at} expires=${expIso}`);
  }

  const plBizId = c.business_profile_id;
  const { data: plMax } = await sb.from('xero_pl_lines').select('period_month,updated_at').eq('business_id', plBizId).order('period_month', { ascending: false }).limit(1);
  const { data: plMin } = await sb.from('xero_pl_lines').select('period_month').eq('business_id', plBizId).order('period_month', { ascending: true }).limit(1);
  const { count: plCount } = await sb.from('xero_pl_lines').select('id', { count: 'exact', head: true }).eq('business_id', plBizId);
  console.log(`xero_pl_lines (keyed by business_profiles.id): count=${plCount}  range=${plMin?.[0]?.period_month ?? 'NONE'}..${plMax?.[0]?.period_month ?? 'NONE'}  last_updated=${plMax?.[0]?.updated_at ?? '—'}`);

  const { data: bsMax } = await sb.from('xero_bs_lines').select('balance_date,updated_at').eq('business_id', plBizId).order('balance_date', { ascending: false }).limit(1);
  const { data: bsMin } = await sb.from('xero_bs_lines').select('balance_date').eq('business_id', plBizId).order('balance_date', { ascending: true }).limit(1);
  const { count: bsCount } = await sb.from('xero_bs_lines').select('id', { count: 'exact', head: true }).eq('business_id', plBizId);
  console.log(`xero_bs_lines (keyed by business_profiles.id): count=${bsCount}  range=${bsMin?.[0]?.balance_date ?? 'NONE'}..${bsMax?.[0]?.balance_date ?? 'NONE'}  last_updated=${bsMax?.[0]?.updated_at ?? '—'}`);

  // Per-tenant PL coverage spot-check (consolidated clients)
  if ((conns ?? []).length > 1) {
    console.log('Per-tenant PL line counts (consolidated client):');
    for (const t of conns) {
      const { count } = await sb.from('xero_pl_lines').select('id', { count: 'exact', head: true }).eq('business_id', plBizId).eq('tenant_id', t.tenant_id);
      const { data: mx } = await sb.from('xero_pl_lines').select('period_month').eq('business_id', plBizId).eq('tenant_id', t.tenant_id).order('period_month', { ascending: false }).limit(1);
      const { count: bsCnt } = await sb.from('xero_bs_lines').select('id', { count: 'exact', head: true }).eq('business_id', plBizId).eq('tenant_id', t.tenant_id);
      console.log(`  • ${pad(t.tenant_name, 32)} pl_rows=${count}  bs_rows=${bsCnt}  pl_latest=${mx?.[0]?.period_month ?? 'NONE'}`);
    }
  }

  // ── (c) Forecast coverage ────────────────────────────────────────────────
  sub('(c) Forecast coverage');
  const { data: forecasts } = await sb.from('financial_forecasts').select('id,name,fiscal_year,year_type,version_number,is_active,is_completed,forecast_start_month,forecast_end_month,actual_start_month,actual_end_month,created_at,updated_at,tenant_id').eq('business_id', plBizId).order('created_at', { ascending: false });
  console.log(`financial_forecasts (keyed by business_profiles.id): ${forecasts?.length ?? 0} total`);
  for (const f of forecasts ?? []) {
    console.log(`  • [${f.is_active ? 'ACTIVE' : '      '}] ${f.name} (FY${f.fiscal_year} ${f.year_type} v${f.version_number})  fc=${f.forecast_start_month}→${f.forecast_end_month}  act=${f.actual_start_month}→${f.actual_end_month}  completed=${f.is_completed}  tenant=${f.tenant_id ?? 'consolidated'}`);
  }
  const active = (forecasts ?? []).filter(f => f.is_active);
  for (const f of active) {
    const { count: plCnt } = await sb.from('forecast_pl_lines').select('id', { count: 'exact', head: true }).eq('forecast_id', f.id);
    const { data: sample } = await sb.from('forecast_pl_lines').select('forecast_months,actual_months').eq('forecast_id', f.id).limit(1);
    const fcMonths = sample?.[0]?.forecast_months ? Object.keys(sample[0].forecast_months).length : 0;
    const acMonths = sample?.[0]?.actual_months ? Object.keys(sample[0].actual_months).length : 0;
    const { data: ps } = await sb.from('forecast_payroll_summary').select('id,pay_runs_per_month,wages_admin_monthly,wages_cogs_monthly,superannuation_monthly,payroll_tax_monthly').eq('forecast_id', f.id);
    const { count: empCnt } = await sb.from('forecast_employees').select('id', { count: 'exact', head: true }).eq('forecast_id', f.id);
    console.log(`    └ ACTIVE "${f.name}": forecast_pl_lines=${plCnt} (fc_months=${fcMonths} act_months=${acMonths})  payroll_summary=${ps?.length ?? 0}  employees=${empCnt}`);
    if (ps?.[0]) console.log(`      payroll: runs/mo=${ps[0].pay_runs_per_month} wages_admin=${ps[0].wages_admin_monthly} wages_cogs=${ps[0].wages_cogs_monthly} super=${ps[0].superannuation_monthly} ptax=${ps[0].payroll_tax_monthly}`);
  }
  if (active.length > 1) console.log(`  ⚠ multiple active forecasts (${active.length}) — phase-67 enforcement expects unique active per (business, FY)`);
  if (active.length === 0) console.log('  ⚠ NO active forecast — budget/variance cannot be computed');

  // ── (d) Subscription budget coverage ─────────────────────────────────────
  sub('(d) Subscription budget coverage');
  const { count: subCnt } = await sb.from('subscription_budgets').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id);
  const { data: subs } = await sb.from('subscription_budgets').select('vendor_name,frequency,monthly_budget,annual_budget,is_active,renewal_month,account_codes,current_fy_spend').eq('business_id', c.business_id).order('annual_budget', { ascending: false }).limit(15);
  console.log(`subscription_budgets (keyed by businesses.id) total=${subCnt}`);
  for (const s of subs ?? []) {
    const ac = Array.isArray(s.account_codes) ? s.account_codes.length : 0;
    console.log(`  • ${pad(s.vendor_name ?? '(null)', 30)} freq=${pad(s.frequency,9)} mo=${pad(s.monthly_budget ?? '—', 8)} ann=${pad(s.annual_budget ?? '—', 9)} fy_spend=${s.current_fy_spend ?? '—'} renewal=${s.renewal_month ?? '—'} active=${s.is_active} acct_codes=${ac}`);
  }
  const { count: nullVendor } = await sb.from('subscription_budgets').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id).is('vendor_name', null);
  const { count: nullBudget } = await sb.from('subscription_budgets').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id).is('monthly_budget', null);
  const { count: nullRenewal } = await sb.from('subscription_budgets').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id).is('renewal_month', null);
  if (nullVendor)  console.log(`  ⚠ ${nullVendor} rows with NULL vendor_name`);
  if (nullBudget)  console.log(`  ⚠ ${nullBudget} rows with NULL monthly_budget`);
  if (nullRenewal && subCnt) console.log(`  ⚠ ${nullRenewal}/${subCnt} rows with NULL renewal_month`);

  // ── (e) Monthly report snapshot history ──────────────────────────────────
  sub('(e) Monthly report snapshots (last 6 months)');
  const since = monthsBack(6);
  const { data: snaps } = await sb.from('monthly_report_snapshots').select('report_month,status,is_draft,unreconciled_count,commentary,report_data,coach_notes,generated_at,pdf_exported_at').eq('business_id', c.business_id).gte('report_month', since).order('report_month', { ascending: false });
  console.log(`monthly_report_snapshots (keyed by businesses.id): ${snaps?.length ?? 0} since ${since}`);
  const byMonth = {};
  for (const s of snaps ?? []) byMonth[s.report_month] = (byMonth[s.report_month] ?? 0) + 1;
  for (const s of snaps ?? []) {
    const rd = s.report_data ?? {};
    const sections = rd.sections ?? {};
    const sectionKeys = Object.keys(sections);
    const hasWages = sectionKeys.some(k => /wage/i.test(k));
    const hasSubs  = sectionKeys.some(k => /subscription|subs/i.test(k));
    const hasComment = !!(s.commentary && String(s.commentary).trim().length > 0);
    console.log(`  • ${s.report_month}  status=${pad(s.status,10)} draft=${s.is_draft} unrec=${s.unreconciled_count} comment=${hasComment} wages=${hasWages} subs=${hasSubs} pdf=${s.pdf_exported_at ?? '—'}  sections=[${sectionKeys.join(',')}]`);
  }
  for (const [m, n] of Object.entries(byMonth)) if (n > 1) console.log(`  ⚠ duplicate snapshots for ${m}: ${n} rows`);

  // ── (f) Anomaly checks ───────────────────────────────────────────────────
  sub('(f) Anomaly checks');
  const today = new Date().toISOString().slice(0, 10);
  const { data: future } = await sb.from('financial_forecasts').select('id,name,actual_end_month').eq('business_id', plBizId).gt('actual_end_month', today.slice(0,7));
  if (future?.length) console.log(`  ⚠ ${future.length} forecast(s) with actual_end_month > current month: ${future.map(f=>f.name+':'+f.actual_end_month).join(' | ')}`);
  const staleDays = (iso) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null;
  for (const t of conns ?? []) {
    const d = staleDays(t.last_synced_at);
    if (d != null && d > 7) console.log(`  ⚠ Xero tenant "${t.tenant_name}" last sync ${d}d ago`);
    const expDays = staleDays(t.expires_at);
    if (expDays != null && expDays > 0) console.log(`  ⚠ Xero tenant "${t.tenant_name}" access token expired ${expDays}d ago — refresh-required`);
  }
  if (bp && bp.fiscal_year_start == null) console.log('  ⚠ business_profiles.fiscal_year_start is NULL — month-end report needs FY anchor');
  if (bp && bp.profile_completed === false) console.log('  ⚠ business_profiles.profile_completed = false');
  if (biz && biz.consolidation_budget_mode === 'single' && (conns?.length ?? 0) > 1) console.log(`  ⚠ ${conns.length} tenants but consolidation_budget_mode=single — review for IICT multi-currency`);
  for (const t of conns ?? []) if (!t.functional_currency) console.log(`  ⚠ xero_connection ${t.tenant_name} has NULL functional_currency`);
  // Orphan checks
  const { count: plOrphan } = await sb.from('xero_pl_lines').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id);
  const { count: bsOrphan } = await sb.from('xero_bs_lines').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id);
  const { count: subOrphan } = await sb.from('subscription_budgets').select('id', { count: 'exact', head: true }).eq('business_id', c.business_profile_id);
  const { count: snapOrphan } = await sb.from('monthly_report_snapshots').select('id', { count: 'exact', head: true }).eq('business_id', c.business_profile_id);
  const { count: fcOrphan } = await sb.from('financial_forecasts').select('id', { count: 'exact', head: true }).eq('business_id', c.business_id);
  if (plOrphan)   console.log(`  ⚠ DUAL-ID DRIFT: ${plOrphan} xero_pl_lines rows keyed by businesses.id (should be business_profiles.id)`);
  if (bsOrphan)   console.log(`  ⚠ DUAL-ID DRIFT: ${bsOrphan} xero_bs_lines rows keyed by businesses.id`);
  if (subOrphan)  console.log(`  ⚠ DUAL-ID DRIFT: ${subOrphan} subscription_budgets rows keyed by business_profiles.id (should be businesses.id)`);
  if (snapOrphan) console.log(`  ⚠ DUAL-ID DRIFT: ${snapOrphan} monthly_report_snapshots rows keyed by business_profiles.id`);
  if (fcOrphan)   console.log(`  ⚠ DUAL-ID DRIFT: ${fcOrphan} financial_forecasts rows keyed by businesses.id`);
}

(async () => {
  console.log(`Phase 70 data-health audit — ${new Date().toISOString()}`);
  console.log(`Supabase URL: ${URL}`);
  console.log(`Key type: ${process.env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_KEY'}`);
  for (const c of CLIENTS) {
    try { await auditClient(c); }
    catch (e) { console.error(`\nERR auditing ${c.label}:`, e?.message ?? e); }
  }
  console.log('\nDone.');
})();
