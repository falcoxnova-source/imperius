-- =====================================================================
-- Balance: Free daily mission bonuses capped at 5%
-- Premium missions unchanged
-- =====================================================================

UPDATE daily_missions SET reward_value = 5 WHERE (cost_fxu IS NULL OR cost_fxu = 0) AND reward_value > 5;

-- Verify changes
SELECT code, title_es, reward_type, reward_value, cost_fxu 
FROM daily_missions 
WHERE (cost_fxu IS NULL OR cost_fxu = 0)
ORDER BY reward_type, reward_value DESC;
