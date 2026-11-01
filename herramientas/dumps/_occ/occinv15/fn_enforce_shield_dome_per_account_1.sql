CREATE OR REPLACE FUNCTION public.enforce_shield_dome_per_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'L??mite: solo 1 % por cuenta permitido. Ya tienes %.', v_def_name, v_total_acct;
  END IF;

  RETURN NEW;
END;
$function$

