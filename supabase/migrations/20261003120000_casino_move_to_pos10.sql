-- [CASINO4] El Casino Galactico pasa de 3:250:17 a 3:250:10 (posicion normal de planeta, vacia).
-- secure_send_fleet ya usa _casino_is_location -> sigue bloqueando flotas normales.
-- Trigger defensivo: nadie puede crear/mover un planeta a esa coordenada.

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM public.planets WHERE galaxy = 3 AND solar_system = 250 AND position = 10) THEN
    RAISE EXCEPTION '3:250:10 ocupado, abortado';
  END IF;
END
$mig$;

CREATE OR REPLACE FUNCTION public._casino_is_location(p_galaxy integer, p_system integer, p_position integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_galaxy = 3 AND p_system = 250 AND p_position = 10;
$$;

DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := replace(pg_get_functiondef('public._hero_casino_flight_seconds(uuid,integer,integer,integer)'::regprocedure), E'\r', '');
  v_new := replace(v_def, 'p_position, 3, 250, 17)', 'p_position, 3, 250, 10)');
  IF v_new = v_def THEN RAISE EXCEPTION 'ancla flight_seconds no encontrada'; END IF;
  EXECUTE v_new;

  v_def := replace(pg_get_functiondef('public.get_casino_status()'::regprocedure), E'\r', '');
  v_new := replace(v_def, '''position'', 17,', '''position'', 10,');
  IF v_new = v_def THEN RAISE EXCEPTION 'ancla get_casino_status no encontrada'; END IF;
  EXECUTE v_new;
END
$mig$;

CREATE OR REPLACE FUNCTION public._trg_planets_block_casino()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public._casino_is_location(NEW.galaxy, NEW.solar_system, NEW.position) THEN
    RAISE EXCEPTION 'Coordenada reservada para el Casino Galactico';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._trg_planets_block_casino() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_planets_block_casino ON public.planets;
CREATE TRIGGER trg_planets_block_casino
  BEFORE INSERT OR UPDATE OF galaxy, solar_system, position ON public.planets
  FOR EACH ROW EXECUTE FUNCTION public._trg_planets_block_casino();
