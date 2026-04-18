-- ============================================================
-- Phase 34 Iteration 34.0 — Seed data
-- Creates Dragon Consolidation + IICT Consolidation groups,
-- their members, elimination rules, and flags both parent
-- businesses as is_cfo_client so they appear on /cfo.
--
-- Idempotent: ON CONFLICT DO NOTHING + DO blocks gated on
-- business lookups. Safe to re-run. If member businesses are
-- missing (e.g. fresh dev DB), RAISE NOTICE logs the skip;
-- migration does NOT error.
--
-- Pattern: PATTERNS.md § seed migration (DO block + RAISE
-- NOTICE fallback) — matches 20260419_cashflow_schedules.sql.
-- ============================================================

DO $$
DECLARE
  -- Dragon group
  v_dragon_parent_biz      uuid;   -- "Dragon Consolidation" parent business
  v_dragon_roofing_biz     uuid;
  v_easy_hail_biz          uuid;
  v_dragon_group_id        uuid;

  -- IICT group
  v_iict_parent_biz        uuid;   -- "IICT Consolidation" parent
  v_iict_aust_biz          uuid;
  v_iict_hk_biz            uuid;
  v_iict_group_ptyltd_biz  uuid;
  v_iict_group_id          uuid;
BEGIN
  -- ==================== Dragon ====================
  -- Parent business for Dragon Consolidation. We try a dedicated
  -- "Dragon Consolidation" row first, fall back to Dragon Roofing
  -- (which can double as the umbrella in simpler setups).
  SELECT id INTO v_dragon_parent_biz FROM businesses WHERE name ILIKE '%Dragon Consolidation%' LIMIT 1;
  SELECT id INTO v_dragon_roofing_biz FROM businesses WHERE name ILIKE '%Dragon Roofing%' LIMIT 1;
  SELECT id INTO v_easy_hail_biz      FROM businesses WHERE name ILIKE '%Easy Hail%'      LIMIT 1;

  IF v_dragon_parent_biz IS NULL THEN
    v_dragon_parent_biz := v_dragon_roofing_biz;   -- fallback per PATTERNS.md seed pattern
  END IF;

  IF v_dragon_parent_biz IS NULL OR v_dragon_roofing_biz IS NULL OR v_easy_hail_biz IS NULL THEN
    RAISE NOTICE 'Dragon seed skipped — missing businesses (parent=%, roofing=%, easyhail=%)',
      v_dragon_parent_biz, v_dragon_roofing_biz, v_easy_hail_biz;
  ELSE
    -- Group
    INSERT INTO consolidation_groups (name, business_id, presentation_currency)
    VALUES ('Dragon Consolidation', v_dragon_parent_biz, 'AUD')
    ON CONFLICT (business_id) DO NOTHING;

    SELECT id INTO v_dragon_group_id FROM consolidation_groups WHERE business_id = v_dragon_parent_biz;

    -- Members
    INSERT INTO consolidation_group_members (group_id, source_business_id, display_name, display_order, functional_currency)
    VALUES
      (v_dragon_group_id, v_dragon_roofing_biz, 'Dragon Roofing Pty Ltd',  0, 'AUD'),
      (v_dragon_group_id, v_easy_hail_biz,      'Easy Hail Claim Pty Ltd', 1, 'AUD')
    ON CONFLICT (group_id, source_business_id) DO NOTHING;

    -- Elimination rule 1: Advertising transfer (bidirectional)
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_dragon_group_id, 'account_category',
      v_dragon_roofing_biz, NULL, '^Advertising & Marketing$',
      v_easy_hail_biz,      NULL, '^Advertising & Marketing$',
      'bidirectional', 'Dragon/EasyHail advertising transfer (intercompany expense reallocation)', true
    )
    ON CONFLICT DO NOTHING;

    -- Elimination rule 2: Referral fees (bidirectional) — different account names per side
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_dragon_group_id, 'account_pair',
      v_dragon_roofing_biz, NULL, '^Referral Fee - Easy Hail$',
      v_easy_hail_biz,      NULL, '^Sales - Referral Fee$',
      'bidirectional', 'Dragon-to-EasyHail referral fees', true
    )
    ON CONFLICT DO NOTHING;

    -- Elimination rule 3: Intercompany loan (BS use — Iteration 34.1 consumes this rule)
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_dragon_group_id, 'intercompany_loan',
      v_dragon_roofing_biz, NULL, 'Loan Payable - Dragon Roofing',
      v_easy_hail_biz,      NULL, 'Loan Receivable - Dragon Roofing',
      'bidirectional', 'Dragon/EasyHail intercompany loan ($280k–$315k range)', true
    )
    ON CONFLICT DO NOTHING;

    -- CFO dashboard flag
    UPDATE businesses SET is_cfo_client = true WHERE id = v_dragon_parent_biz;

    RAISE NOTICE 'Dragon Consolidation seeded (group_id=%)', v_dragon_group_id;
  END IF;

  -- ==================== IICT ====================
  SELECT id INTO v_iict_parent_biz       FROM businesses WHERE name ILIKE '%IICT Consolidation%'   LIMIT 1;
  SELECT id INTO v_iict_aust_biz         FROM businesses WHERE name ILIKE '%IICT%Aust%'            LIMIT 1;
  SELECT id INTO v_iict_hk_biz           FROM businesses WHERE name ILIKE '%IICT Group Limited%'   LIMIT 1;
  SELECT id INTO v_iict_group_ptyltd_biz FROM businesses WHERE name ILIKE '%IICT Group Pty Ltd%'   LIMIT 1;

  IF v_iict_parent_biz IS NULL THEN
    v_iict_parent_biz := v_iict_aust_biz;  -- fallback
  END IF;

  IF v_iict_parent_biz IS NULL OR v_iict_aust_biz IS NULL OR v_iict_hk_biz IS NULL OR v_iict_group_ptyltd_biz IS NULL THEN
    RAISE NOTICE 'IICT seed skipped — missing businesses (parent=%, aust=%, hk=%, ptyltd=%)',
      v_iict_parent_biz, v_iict_aust_biz, v_iict_hk_biz, v_iict_group_ptyltd_biz;
  ELSE
    INSERT INTO consolidation_groups (name, business_id, presentation_currency)
    VALUES ('IICT Consolidation', v_iict_parent_biz, 'AUD')
    ON CONFLICT (business_id) DO NOTHING;

    SELECT id INTO v_iict_group_id FROM consolidation_groups WHERE business_id = v_iict_parent_biz;

    INSERT INTO consolidation_group_members (group_id, source_business_id, display_name, display_order, functional_currency)
    VALUES
      (v_iict_group_id, v_iict_aust_biz,         'IICT (Aust) Pty Ltd',     0, 'AUD'),
      (v_iict_group_id, v_iict_group_ptyltd_biz, 'IICT Group Pty Ltd',      1, 'AUD'),
      (v_iict_group_id, v_iict_hk_biz,           'IICT Group Limited (HK)', 2, 'HKD')
    ON CONFLICT (group_id, source_business_id) DO NOTHING;

    -- BS intercompany loan elimination (Iteration 34.1 consumes this rule)
    INSERT INTO consolidation_elimination_rules (
      group_id, rule_type,
      entity_a_business_id, entity_a_account_code, entity_a_account_name_pattern,
      entity_b_business_id, entity_b_account_code, entity_b_account_name_pattern,
      direction, description, active
    )
    VALUES (
      v_iict_group_id, 'intercompany_loan',
      v_iict_hk_biz,   NULL, 'Loan - IICT \(Aust\)',
      v_iict_aust_biz, NULL, 'Receivable - IICT Group Limited|Intercompany Receivable',
      'bidirectional', 'IICT HK/Aust intercompany loan ($51,385 per Mar 2026 PDF)', true
    )
    ON CONFLICT DO NOTHING;

    UPDATE businesses SET is_cfo_client = true WHERE id = v_iict_parent_biz;

    RAISE NOTICE 'IICT Consolidation seeded (group_id=%)', v_iict_group_id;
  END IF;
END $$;
