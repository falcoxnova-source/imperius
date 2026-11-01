-- [CASINOGATE4] Casino Galactico sin requisito de Nave Insignia.
--  * Ruleta: el atraque deja de ser obligatorio; ahora respeta el mismo flag que
--    Loteria/Rifa (game_settings.casino_games_require_dock, actualmente 'false').
--    La allowlist de la ruleta y todas las validaciones de apuestas se mantienen.
--  * casino_roulette_status.docked => true cuando el jugador puede jugar.
--  * hero_casino_travel: ya no se puede enviar la nave al Casino (no hace falta).
--  * Todas las naves que estaban en el Casino vuelven al hangar al instante
--    (si no, quedarian bloqueadas para expediciones/duelos/equipar/reparar).
--    Copia previa en public.hero_casino_trips_bak_20261005 (sin acceso via API).
BEGIN;

DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  -- 1) casino_roulette_spin
  v_def := pg_get_functiondef('public.casino_roulette_spin(jsonb)'::regprocedure);
  IF position('IF NOT public._casino_can_enter(v_uid) THEN' in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor spin not found';
  END IF;
  v_new := replace(v_def, 'IF NOT public._casino_can_enter(v_uid) THEN',
                          'IF public._casino_games_gate(v_uid) IS NOT NULL THEN');
  EXECUTE v_new;

  -- 2) casino_roulette_status
  v_def := pg_get_functiondef('public.casino_roulette_status()'::regprocedure);
  IF position('''docked'', public._casino_can_enter(v_uid),' in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor status not found';
  END IF;
  v_new := replace(v_def, '''docked'', public._casino_can_enter(v_uid),',
                          '''docked'', (public._casino_games_gate(v_uid) IS NULL),');
  EXECUTE v_new;

  -- 3) hero_casino_travel: deshabilitado
  v_def := pg_get_functiondef('public.hero_casino_travel()'::regprocedure);
  IF position('IF NOT public._hero_has_access(v_uid) THEN' in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor travel not found';
  END IF;
  v_new := replace(v_def, 'IF NOT public._hero_has_access(v_uid) THEN',
    'RETURN jsonb_build_object(''success'', false, ''error'', ''Ya no es necesario enviar la Nave Insignia al Casino: las mesas estan abiertas para todos'');' || chr(10) ||
    '  IF NOT public._hero_has_access(v_uid) THEN');
  EXECUTE v_new;
END
$mig$;

-- 4) Devolver todas las naves al hangar (con copia de seguridad)
CREATE TABLE IF NOT EXISTS public.hero_casino_trips_bak_20261005 AS
  SELECT * FROM public.hero_casino_trips;
ALTER TABLE public.hero_casino_trips_bak_20261005 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hero_casino_trips_bak_20261005 FROM anon, authenticated;

DELETE FROM public.hero_casino_trips;

-- Lotería/Rifa siguen sin requisito
UPDATE public.game_settings SET value = 'false' WHERE key = 'casino_games_require_dock';

COMMIT;
