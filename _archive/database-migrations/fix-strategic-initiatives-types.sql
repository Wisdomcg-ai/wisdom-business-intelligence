-- Fix strategic_initiatives table - remove old integer columns and ensure proper types

-- Drop old columns that might be integers
ALTER TABLE strategic_initiatives DROP COLUMN IF EXISTS impact;
ALTER TABLE strategic_initiatives DROP COLUMN IF EXISTS effort;
ALTER TABLE strategic_initiatives DROP COLUMN IF EXISTS status;
ALTER TABLE strategic_initiatives DROP COLUMN IF EXISTS owner;
ALTER TABLE strategic_initiatives DROP COLUMN IF EXISTS due_date;

-- Ensure our new columns exist with correct TEXT types
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS estimated_effort TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS timeline TEXT;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT false;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE strategic_initiatives ADD COLUMN IF NOT EXISTS linked_kpis JSONB;
