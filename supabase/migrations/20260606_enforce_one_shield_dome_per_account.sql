-- =====================================================================
-- Fix: Enforce 1 shield dome per ACCOUNT (not per planet)
-- 
-- Problem: max_per_planet=1 allows one per planet, but users with many
-- planets build shield domes on each, accumulating 8+, 9+, 11+ domes.
-- Shield domes must be 1 of each type per account (1 small + 1 large).
-- =====================================================================

-- =====================================================================
-- 1. CLEANUP: Remove excess shield domes, keep only 1 per user
-- =====================================================================

-- SMALL SHIELD DOME (ID 7): keep 1 per user (oldest planet), zero the rest
WITH ranked AS (
  SELECT pd.id, pl.user_id,
    ROW_NUMBER() OVER (PARTITION BY pl.user_id ORDER BY pl.created_at ASC) as rn
  FROM planet_defenses pd
  JOIN planets pl ON pl.id = pd.planet_id
  WHERE pd.defense_type_id = 7 AND pd.quantity > 0
)
UPDATE planet_defenses pd
SET quantity = CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END
FROM ranked
WHERE pd.id = ranked.id;

-- LARGE SHIELD DOME (ID 8): keep 1 per user (oldest planet), zero the rest
WITH ranked AS (
  SELECT pd.id, pl.user_id,
    ROW_NUMBER() OVER (PARTITION BY pl.user_id ORDER BY pl.created_at ASC) as rn
  FROM planet_defenses pd
  JOIN planets pl ON pl.id = pd.planet_id
  WHERE pd.defense_type_id = 8 AND pd.quantity > 0
)
UPDATE planet_defenses pd
SET quantity = CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END
FROM ranked
WHERE pd.id = ranked.id;

-- =====================================================================
-- 2. PREVENTION: Trigger to enforce 1 shield dome per account
-- =====================================================================

CREATE OR REPLACE FUNCTION enforce_shield_dome_per_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_acct integer;
  v_user_id uuid;
  v_def_name text;
BEGIN
  IF NEW.defense_type_id NOT IN (7, 8) THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;

  SELECT COALESCE(SUM(pd.quantity), 0) INTO v_total_acct
  FROM planet_defenses pd
  JOIN planets pl ON pl.id = pd.planet_id
  WHERE pl.user_id = v_user_id
    AND pd.defense_type_id = NEW.defense_type_id
    AND pd.id IS DISTINCT FROM NEW.id;

  IF v_total_acct + NEW.quantity > 1 THEN
    SELECT name INTO v_def_name FROM defense_types WHERE id = NEW.defense_type_id;
    RAISE EXCEPTION 'Límite: solo 1 % por cuenta permitido. Ya tienes %.', v_def_name, v_total_acct;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_shield_dome_per_account ON planet_defenses;
CREATE TRIGGER trg_enforce_shield_dome_per_account
  BEFORE INSERT OR UPDATE OF quantity, defense_type_id ON planet_defenses
  FOR EACH ROW
  EXECUTE FUNCTION enforce_shield_dome_per_account();
