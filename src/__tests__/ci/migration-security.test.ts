import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { scanSql, splitStatements, stripComments } from '../../../scripts/ci/check-migration-security.mjs'

describe('migration-security checker — rule A (anon/PUBLIC grants)', () => {
  it('flags GRANT EXECUTE ... TO anon', () => {
    const v = scanSql('m.sql', `grant execute on function public.f(uuid) to anon;`)
    expect(v.map((x) => x.rule)).toContain('A')
  })
  it('flags GRANT ... TO PUBLIC', () => {
    const v = scanSql('m.sql', `grant execute on function public.f() to public;`)
    expect(v.map((x) => x.rule)).toContain('A')
  })
  it('flags anon inside a multi-grantee list', () => {
    const v = scanSql('m.sql', `grant execute on function public.f() to authenticated, anon, service_role;`)
    expect(v.map((x) => x.rule)).toContain('A')
  })
  it('flags the Supabase quoted form GRANT ... TO "anon"', () => {
    const v = scanSql('m.sql', `GRANT ALL ON FUNCTION "public"."f"() TO "anon";`)
    expect(v.map((x) => x.rule)).toContain('A')
  })
  it('does NOT flag GRANT ... TO authenticated, service_role', () => {
    const v = scanSql('m.sql', `grant execute on function public.f(uuid) to authenticated, service_role;`)
    expect(v).toHaveLength(0)
  })
  it('does NOT flag REVOKE ... FROM anon, PUBLIC (that is the good direction)', () => {
    const v = scanSql('m.sql', `revoke all on function public.f() from public, anon, authenticated;`)
    expect(v).toHaveLength(0)
  })
  it('honours the "-- security-allow: anon-grant" escape hatch', () => {
    const v = scanSql('m.sql', `-- security-allow: anon-grant  new RLS helper, must be anon-callable\ngrant execute on function public.auth_helper() to anon;`)
    expect(v).toHaveLength(0)
  })
})

describe('migration-security checker — rule B (definer search_path)', () => {
  it('flags a SECURITY DEFINER function with no SET search_path', () => {
    const sql = `create or replace function public.f() returns void language plpgsql security definer as $$ begin end; $$;`
    const v = scanSql('m.sql', sql)
    expect(v.map((x) => x.rule)).toContain('B')
  })
  it('does NOT flag when SET search_path is present', () => {
    const sql = `create or replace function public.f() returns void language plpgsql security definer set search_path to 'public' as $$ begin end; $$;`
    const v = scanSql('m.sql', sql)
    expect(v.filter((x) => x.rule === 'B')).toHaveLength(0)
  })
  it('does NOT flag SECURITY INVOKER functions', () => {
    const sql = `create function public.f() returns void language sql as $$ select 1 $$;`
    expect(scanSql('m.sql', sql).filter((x) => x.rule === 'B')).toHaveLength(0)
  })
  it('a "; " inside the function body does not confuse statement splitting', () => {
    const sql = `create function public.f() returns void language plpgsql security definer set search_path to '' as $fn$ begin perform 1; perform 2; end; $fn$;`
    expect(scanSql('m.sql', sql).filter((x) => x.rule === 'B')).toHaveLength(0)
    expect(splitStatements(sql)).toHaveLength(1)
  })
})

describe('migration-security checker — rule C (RLS on new public tables)', () => {
  it('flags CREATE TABLE with no ENABLE ROW LEVEL SECURITY', () => {
    const v = scanSql('m.sql', `create table public.secrets (id uuid primary key, val text);`)
    expect(v.map((x) => x.rule)).toContain('C')
  })
  it('does NOT flag when RLS is enabled in the same file', () => {
    const sql = `create table public.t (id uuid primary key);\nalter table public.t enable row level security;`
    expect(scanSql('m.sql', sql).filter((x) => x.rule === 'C')).toHaveLength(0)
  })
  it('does NOT flag tables in non-public schemas', () => {
    expect(scanSql('m.sql', `create table auth.x (id uuid);`).filter((x) => x.rule === 'C')).toHaveLength(0)
  })
  it('honours the "-- security-allow: no-rls" escape hatch', () => {
    const sql = `-- security-allow: no-rls  partition child, parent carries RLS\ncreate table public.t_2026 partition of public.t for values in (2026);`
    expect(scanSql('m.sql', sql).filter((x) => x.rule === 'C')).toHaveLength(0)
  })
})

describe('stripComments', () => {
  it('removes line and block comments but keeps dollar-quoted bodies', () => {
    const out = stripComments(`-- hi\nselect 1 /* x */; $b$ -- kept\n $b$`)
    expect(out).not.toContain('hi')
    expect(out).not.toContain('/* x */')
    expect(out).toContain('-- kept')
  })
})

describe('no false positives on the real 23–24 Aug security migrations', () => {
  const realMigrations = [
    'supabase/migrations/20260823061549_sec_revoke_anon_authenticated_from_dead_account_functions.sql',
    'supabase/migrations/20260823220734_sec_revoke_anon_from_definer_write_rpcs.sql',
    'supabase/migrations/20260823220741_sec_close_anon_default_execute_on_future_functions.sql',
    'supabase/migrations/20260823230402_sec_internal_authz_guards_forecast_rpcs.sql',
  ]
  for (const f of realMigrations) {
    it(`${f.split('/').pop()} passes cleanly`, () => {
      const sql = readFileSync(f, 'utf8')
      const v = scanSql(f, sql)
      expect(v, JSON.stringify(v, null, 2)).toHaveLength(0)
    })
  }
})
