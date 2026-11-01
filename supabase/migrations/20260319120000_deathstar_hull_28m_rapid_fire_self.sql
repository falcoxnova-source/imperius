-- ============================================================
-- Death Star rebalance: hull 28M + rapid fire vs self (10)
--
-- Goal: 3 Death Stars can destroy 1 in combat (within 6 rounds)
--       2 Death Stars cannot destroy 1 (draw)
--
-- Changes:
--   structural_integrity: 3,150,000 → 28,000,000
--   rapid_fire: add "deathstar": 10 (only affects DS vs DS)
-- ============================================================

-- 1. Hull to 28M
UPDATE ship_types
SET structural_integrity = 28000000
WHERE code = 'deathstar';

-- 2. Add rapid fire vs self (10) and vs star_destroyer (3)
UPDATE ship_types
SET rapid_fire = rapid_fire || '{"deathstar": 10, "star_destroyer": 3}'::jsonb
WHERE code = 'deathstar';
