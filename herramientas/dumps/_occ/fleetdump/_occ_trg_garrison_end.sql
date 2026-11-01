CREATE OR REPLACE FUNCTION public._occ_trg_garrison_end()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fid uuid;
  v_reason text;
  v_occ uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_fid := OLD.id;
    v_reason := 'liberated';
  ELSE
    v_fid := NEW.id;
    v_reason := CASE WHEN NEW.is_returning AND NOT NEW.is_completed THEN 'abandoned' ELSE 'liberated' END;
  END IF;
  SELECT id INTO v_occ FROM public.occupations WHERE garrison_fleet_id = v_fid AND status = 'active';
  IF v_occ IS NOT NULL THEN
    BEGIN
      PERFORM public._occ_end(v_occ, v_reason);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[OCUPA1] garrison end % failed: %', v_occ, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$

