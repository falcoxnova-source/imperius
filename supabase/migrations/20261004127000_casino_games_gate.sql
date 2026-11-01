-- [CASINOGATE1] Loteria y Rifa como mesas del Casino Galactico.
-- Si casino_games_require_dock = 'true', comprar tickets exige la Nave Insignia (Nave Heroe)
-- estacionada en el Casino (_casino_can_enter). Con 'false' todo sigue igual que antes.

INSERT INTO public.game_settings (key, value, description)
VALUES ('casino_games_require_dock', 'false',
        'Si es true, para comprar tickets de Loteria y Rifa hay que tener la Nave Insignia estacionada en el Casino Galactico')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public._casino_games_require_dock()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT lower(btrim(value)) FROM public.game_settings WHERE key = 'casino_games_require_dock'), 'false') = 'true';
$$;

-- Devuelve NULL si puede participar, o el mensaje de error
CREATE OR REPLACE FUNCTION public._casino_games_gate(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public._casino_games_require_dock() AND NOT public._casino_can_enter(p_user_id)
      THEN 'Para participar debes tener tu Nave Insignia estacionada en el Casino Galactico [3:250:10]'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public._casino_games_require_dock() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._casino_games_gate(uuid) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_def text;
  v_anchor text := E'    RETURN jsonb_build_object(''success'', false, ''error'', ''No autenticado'');\n  END IF;\n';
  v_gate text := E'    RETURN jsonb_build_object(''success'', false, ''error'', ''No autenticado'');\n  END IF;\n\n  -- [CASINOGATE1] mesa del Casino: requiere Nave Insignia estacionada (si esta activado)\n  IF public._casino_games_gate(v_user_id) IS NOT NULL THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', public._casino_games_gate(v_user_id));\n  END IF;\n';
  v_fn regprocedure;
  v_cnt integer;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.buy_lottery_ticket(integer[])'::regprocedure, 'public.buy_raffle_ticket(uuid,integer)'::regprocedure] LOOP
    v_def := replace(pg_get_functiondef(v_fn), chr(13), '');
    IF position('[CASINOGATE1]' IN v_def) > 0 THEN CONTINUE; END IF;
    v_cnt := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'anchor count % in %', v_cnt, v_fn; END IF;
    EXECUTE replace(v_def, v_anchor, v_gate);
  END LOOP;

  v_def := replace(pg_get_functiondef('public.get_casino_status()'::regprocedure), chr(13), '');
  IF position('[CASINOGATE1]' IN v_def) = 0 THEN
    v_cnt := (length(v_def) - length(replace(v_def, '''can_enter'', false, ''server_time'', now());', ''))) / length('''can_enter'', false, ''server_time'', now());');
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'anchor A count %', v_cnt; END IF;
    v_cnt := (length(v_def) - length(replace(v_def, '''can_enter'', v_state = ''docked'',', ''))) / length('''can_enter'', v_state = ''docked'',');
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'anchor B count %', v_cnt; END IF;
    v_def := replace(v_def, '''can_enter'', false, ''server_time'', now());',
      '''can_enter'', false, ''server_time'', now(), /* [CASINOGATE1] */ ''games_require_dock'', public._casino_games_require_dock());');
    v_def := replace(v_def, '''can_enter'', v_state = ''docked'',',
      '''can_enter'', v_state = ''docked'', /* [CASINOGATE1] */ ''games_require_dock'', public._casino_games_require_dock(),');
    EXECUTE v_def;
  END IF;
END $$;
