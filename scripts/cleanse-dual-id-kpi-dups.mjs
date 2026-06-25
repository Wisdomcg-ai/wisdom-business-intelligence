#!/usr/bin/env node
/**
 * Phase 75-01 Task 2 — cleanse the 13 stale biz-keyed business_kpis duplicates.
 *
 * These are exact value-copies of active profile-keyed twins (left over from the
 * 2026-06-19 coach-mode incident; #312 fixed the save path same-day so none
 * regenerate). They block the FK on business_kpis.business_id because the column
 * still holds businesses.id values. Removing them makes business_id 100% profile.
 *
 * SAFETY: a row is only deletable if it has an ACTIVE profile-keyed twin (same
 * resolved profile id + same name) whose value fields are IDENTICAL. Any row that
 * fails this check is SKIPPED and reported — never force-deleted.
 *
 * Dry-run by default (prints the plan). `--apply` snapshots then deletes.
 * Run: node scripts/cleanse-dual-id-kpi-dups.mjs            # dry-run
 *      node scripts/cleanse-dual-id-kpi-dups.mjs --apply    # snapshot + delete + verify
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const SNAP_DIR = '.planning/phases/75-dual-id-durable-tail/snapshots';
const VAL = ['target_value', 'current_value', 'year1_target', 'year2_target', 'year3_target', 'what_to_do', 'notes'];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const biz = new Set(); { const { data } = await sb.from('businesses').select('id'); data.forEach(r => biz.add(r.id)); }
const prof = new Set(); { const { data } = await sb.from('business_profiles').select('id'); data.forEach(r => prof.add(r.id)); }
const { data: bp } = await sb.from('business_profiles').select('id,business_id');
const b2p = new Map(bp.map(r => [r.business_id, r.id]));
const { data: kpis } = await sb.from('business_kpis').select('*');

const dups = kpis.filter(k => biz.has(k.business_id) && !prof.has(k.business_id));
const deletable = []; const skipped = [];
for (const d of dups) {
  const pid = b2p.get(d.business_id);
  const twin = pid && kpis.find(k => k.id !== d.id && k.business_id === pid && k.name === d.name);
  const identical = twin && VAL.every(c => JSON.stringify(d[c]) === JSON.stringify(twin[c]));
  if (twin && twin.is_active && identical) deletable.push({ d, twin, pid });
  else skipped.push({ d, reason: !twin ? 'no twin' : !twin.is_active ? 'twin inactive' : 'values differ' });
}

console.log(`business_kpis biz-keyed duplicates: ${dups.length}  |  deletable (safe): ${deletable.length}  |  skipped: ${skipped.length}\n`);
for (const { d, twin, pid } of deletable) {
  console.log(`  DELETE ${d.id.slice(0, 8)}  "${d.name}"  biz=${d.business_id.slice(0, 8)} -> keep profile twin ${twin.id.slice(0, 8)} (prof ${pid.slice(0, 8)})`);
}
for (const { d, reason } of skipped) console.log(`  SKIP   ${d.id.slice(0, 8)}  "${d.name}"  (${reason})`);

if (!APPLY) {
  console.log(`\nDRY-RUN. Re-run with --apply to snapshot + delete ${deletable.length} rows.`);
  process.exit(0);
}
if (skipped.length) { console.error(`\nABORT: ${skipped.length} row(s) failed the safety check — refusing to apply.`); process.exit(1); }

// Snapshot the exact rows to be deleted (full records) before deleting.
mkdirSync(SNAP_DIR, { recursive: true });
const stamp = process.env.SNAP_STAMP || 'apply';
const snapPath = `${SNAP_DIR}/75-01-business_kpis-dups-${stamp}.json`;
writeFileSync(snapPath, JSON.stringify(deletable.map(x => x.d), null, 2));
console.log(`\nSnapshot written: ${snapPath} (${deletable.length} rows)`);

const ids = deletable.map(x => x.d.id);
const { error } = await sb.from('business_kpis').delete().in('id', ids);
if (error) { console.error('DELETE failed:', error.message); process.exit(1); }
console.log(`Deleted ${ids.length} rows.`);

// Re-verify: business_kpis.business_id should now be 100% profile.
const { data: after } = await sb.from('business_kpis').select('business_id');
const stillBiz = after.filter(r => r.business_id && biz.has(r.business_id) && !prof.has(r.business_id)).length;
console.log(`\nPost-delete: business_kpis rows=${after.length}, still biz-keyed=${stillBiz}  → ${stillBiz === 0 ? 'GREEN (FK-ready)' : 'STILL RED'}`);
