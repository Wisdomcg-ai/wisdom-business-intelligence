#!/usr/bin/env node
/**
 * CI security gate for supabase/migrations/*.sql — locks in the 23–24 Aug 2026
 * database security work so the class of bug cannot be silently reintroduced.
 *
 * Scans ONLY the migration files ADDED/MODIFIED in the PR (migrations are
 * append-only, so historical files are never rescanned — that is why this can
 * enforce rules the baseline would otherwise fail). Three rules:
 *
 *   A. No new EXECUTE/other grant to `anon` or `PUBLIC`. This is the exact
 *      root cause behind the 21 revoked RPCs — anon-callable functions that
 *      bypass RLS. Grants to `authenticated`/`service_role` are fine.
 *   B. Every `SECURITY DEFINER` function must `SET search_path` (search-path
 *      hijack hardening). A definer function without it is exploitable.
 *   C. Every new `CREATE TABLE` in the public schema must `ENABLE ROW LEVEL
 *      SECURITY` in the same migration (no bare, unprotected tables).
 *
 * Escape hatch for deliberate exceptions: put a marker comment in the migration
 *   -- security-allow: anon-grant  <reason>   (rule A — e.g. a new RLS helper)
 *   -- security-allow: no-rls      <reason>   (rule C — e.g. a partitioned child)
 * A SECURITY DEFINER function that genuinely must skip search_path is not
 * supported — there is no legitimate case, so rule B has no escape hatch.
 *
 * Pure functions are exported for unit testing; main() runs the git-diff scan.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Split SQL into top-level statements, respecting $tag$ dollar-quotes and
 *  -- / block comments so a `;` inside a function body is not a split point. */
export function splitStatements(sql) {
  const stmts = []
  let buf = ''
  let i = 0
  const n = sql.length
  let dollarTag = null // e.g. '$function$' when inside a dollar-quoted body
  while (i < n) {
    const two = sql.slice(i, i + 2)
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      buf += sql[i++]
      continue
    }
    // line comment
    if (two === '--') {
      const eol = sql.indexOf('\n', i)
      const end = eol === -1 ? n : eol
      buf += sql.slice(i, end)
      i = end
      continue
    }
    // block comment
    if (two === '/*') {
      const close = sql.indexOf('*/', i + 2)
      const end = close === -1 ? n : close + 2
      buf += sql.slice(i, end)
      i = end
      continue
    }
    // single-quoted string
    if (sql[i] === "'") {
      buf += sql[i++]
      while (i < n) {
        buf += sql[i]
        if (sql[i] === "'" && sql[i + 1] === "'") { buf += sql[i + 1]; i += 2; continue }
        if (sql[i] === "'") { i++; break }
        i++
      }
      continue
    }
    // dollar-quote open: $tag$ where tag is [A-Za-z0-9_]*
    if (sql[i] === '$') {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i))
      if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length; continue }
    }
    if (sql[i] === ';') { buf += ';'; stmts.push(buf); buf = ''; i++; continue }
    buf += sql[i++]
  }
  if (buf.trim()) stmts.push(buf)
  return stmts
}

/** Remove -- and block comments from a statement, preserving dollar-quoted
 *  bodies and single-quoted strings, for keyword detection. */
export function stripComments(stmt) {
  let out = ''
  let i = 0
  const n = stmt.length
  let dollarTag = null
  while (i < n) {
    if (dollarTag) {
      if (stmt.startsWith(dollarTag, i)) { out += dollarTag; i += dollarTag.length; dollarTag = null; continue }
      out += stmt[i++]; continue
    }
    const two = stmt.slice(i, i + 2)
    if (two === '--') { const e = stmt.indexOf('\n', i); i = e === -1 ? n : e; continue }
    if (two === '/*') { const c = stmt.indexOf('*/', i + 2); i = c === -1 ? n : c + 2; continue }
    if (stmt[i] === "'") { out += stmt[i++]; while (i < n) { out += stmt[i]; if (stmt[i] === "'" && stmt[i+1] === "'") { out += stmt[i+1]; i += 2; continue } if (stmt[i] === "'") { i++; break } i++ } continue }
    if (stmt[i] === '$') { const m = /^\$[A-Za-z0-9_]*\$/.exec(stmt.slice(i)); if (m) { dollarTag = m[0]; out += m[0]; i += m[0].length; continue } }
    out += stmt[i++]
  }
  return out
}

const hasMarker = (rawStmt, marker) =>
  new RegExp(`security-allow:\\s*${marker}\\b`, 'i').test(rawStmt)

/** Scan one migration file's SQL. Returns an array of {rule, line, message}.
 *  Each rule is anchored to a statement's LEADING keyword so prose inside a
 *  COMMENT ... IS '...' string (which legitimately mentions "grant to anon")
 *  never trips a rule — only real GRANT/CREATE/ALTER statements do. */
export function scanSql(filename, sql) {
  const violations = []
  const statements = splitStatements(sql)
  const createdTables = [] // { table, line, raw }
  const rlsEnabled = new Set()

  let cursor = 0
  for (const raw of statements) {
    const startOffset = sql.indexOf(raw, cursor)
    cursor = startOffset >= 0 ? startOffset + raw.length : cursor + raw.length
    // Attribute the line to the first non-whitespace char of the statement,
    // not the leading newline, so the reported line matches what the author sees.
    const lead0 = raw.length - raw.trimStart().length
    const line = startOffset >= 0 ? sql.slice(0, startOffset + lead0).split('\n').length : 0
    const code = stripComments(raw).trim()
    const lead = (code.match(/^([a-z]+)/i)?.[1] || '').toUpperCase()

    // Rule A — a GRANT statement that grants to anon or PUBLIC.
    if (lead === 'GRANT') {
      const toMatch = /\bTO\b([\s\S]*)$/i.exec(code)
      if (toMatch) {
        // Strip double-quotes so Supabase's quoted form `TO "anon"` is caught
        // exactly like the unquoted `TO anon`.
        const grantees = toMatch[1].replace(/"/g, '')
        const grantsAnon = /(^|[\s,])anon([\s,;]|$)/i.test(grantees)
        const grantsPublic = /(^|[\s,])public([\s,;]|$)/i.test(grantees)
        if ((grantsAnon || grantsPublic) && !hasMarker(raw, 'anon-grant')) {
          violations.push({
            rule: 'A', line,
            message: `GRANT to ${grantsAnon ? 'anon' : 'PUBLIC'} — anon/PUBLIC can call this over the public API and definer functions bypass RLS. Grant to authenticated/service_role instead, or mark "-- security-allow: anon-grant <reason>" for a deliberate RLS helper.`,
          })
        }
      }
    }

    // Rule B — a CREATE FUNCTION that is SECURITY DEFINER must SET search_path.
    if (lead === 'CREATE' && /\bFUNCTION\b/i.test(code) && /\bSECURITY\s+DEFINER\b/i.test(code)) {
      if (!/\bsearch_path\b/i.test(code)) {
        violations.push({
          rule: 'B', line,
          message: `SECURITY DEFINER function without "SET search_path" — vulnerable to search-path hijacking. Add e.g. "SET search_path = ''" or "SET search_path TO 'public'".`,
        })
      }
    }

    // Collect CREATE TABLE (public) and ENABLE RLS targets for rule C.
    if (lead === 'CREATE' && /\bTABLE\b/i.test(code)) {
      const m = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?)(?:(auth|storage|extensions|realtime|graphql_public|supabase_migrations|public)"?\.)?"?([a-z0-9_]+)"?/i.exec(code)
      if (m) {
        const schema = (m[2] || 'public').toLowerCase()
        if (schema === 'public') createdTables.push({ table: m[3].toLowerCase(), line, raw })
      }
    }
    if (lead === 'ALTER' && /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(code)) {
      const m = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)?"?([a-z0-9_]+)"?/i.exec(code)
      if (m) rlsEnabled.add(m[1].toLowerCase())
    }
  }

  // Rule C — every new public table must ENABLE ROW LEVEL SECURITY somewhere in the file.
  for (const c of createdTables) {
    if (!rlsEnabled.has(c.table) && !hasMarker(c.raw, 'no-rls') && !hasMarker(sql, 'no-rls')) {
      violations.push({
        rule: 'C', line: c.line,
        message: `CREATE TABLE public.${c.table} without "ALTER TABLE ... ENABLE ROW LEVEL SECURITY" in the same migration — a public table with no RLS is exposed to every API caller. Enable RLS + add policies, or mark "-- security-allow: no-rls <reason>".`,
      })
    }
  }

  return violations.map((v) => ({ ...v, file: filename }))
}

function changedMigrationFiles() {
  try {
    execSync('git rev-parse --verify origin/main', { stdio: 'ignore' })
  } catch {
    try { execSync('git fetch --quiet origin main', { stdio: 'ignore' }) } catch { /* ignore */ }
  }
  let out = ''
  try {
    out = execSync(
      "git diff --name-only --diff-filter=ACMRT origin/main...HEAD -- 'supabase/migrations/*.sql'",
      { encoding: 'utf8' },
    )
  } catch {
    out = ''
  }
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

function main() {
  const argFiles = process.argv.slice(2).filter((a) => a.endsWith('.sql'))
  const files = argFiles.length ? argFiles : changedMigrationFiles()
  if (!files.length) {
    console.log('migration-security: no changed migration files to scan.')
    return
  }
  const all = []
  for (const f of files) {
    let sql
    try { sql = readFileSync(f, 'utf8') } catch { continue }
    all.push(...scanSql(f, sql))
  }
  if (!all.length) {
    console.log(`migration-security: ${files.length} migration file(s) scanned, no violations.`)
    return
  }
  console.error('migration-security: FAILED\n')
  for (const v of all) {
    console.error(`  [rule ${v.rule}] ${v.file}:${v.line}`)
    console.error(`    ${v.message}\n`)
  }
  process.exit(1)
}

// Run only as CLI (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) main()
