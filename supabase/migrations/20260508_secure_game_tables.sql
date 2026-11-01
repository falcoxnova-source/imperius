-- =====================================================================
-- 20260508_secure_game_tables.sql
-- Cierra vulnerabilidades críticas equivalentes a la del P2P, pero ahora en
-- las tablas del juego. Un usuario autenticado NO debe poder vía PostgREST
-- directo:
--   - auto-acreditarse metal/crystal/deuterium
--   - crear naves/defensas de la nada
--   - subir niveles de edificios o tecnologías
--   - regalarse oficiales VIP o extender su expiración
--   - acelerar colas (end_time = now())
--   - resucitar planetas destruidos o inflar fields_max
--   - marcarse wallet como verificada
--   - falsificar puntos/ranking de alianza
--
-- Estrategia (idéntica al trigger ya probado en `profiles`):
--   Trigger BEFORE UPDATE con SECURITY INVOKER que se aplica SOLO cuando
--   current_user IN ('authenticated','anon'). Dentro de una función
--   SECURITY DEFINER propiedad de `postgres`, current_user cambia a
--   `postgres`, por lo que las 465 RPCs SECURITY DEFINER existentes
--   (secure_add_to_building_queue, secure_start_research, process_*, swap_*,
--   p2p_*, confirm_deposit_usdt, purchase_*, etc.) siguen funcionando
--   sin modificación alguna.
--
-- Compatibilidad verificada:
--   - gameStore.ts: solo hace UPDATE directo en `messages.is_read` (OK) y en
--     `startBuildingUpgrade` (código muerto, no invocado en ninguna página).
--     Todo lo demás ya usa RPCs (`secure_*`, `process_*`, `instant_*`).
--   - AlliancePage.tsx: hace UPDATE directo en:
--       * alliance_members.(rank_level, rank_name, can_*)  ← se PERMITE
--         (RLS ya restringe a oficiales; sólo protegemos columnas que el
--         cliente nunca debería tocar)
--       * alliances.(description, internal_text, is_open)  ← se PERMITE
--         (sólo se protegen campos económicos/ranking)
--   - MarketPage.tsx: usa RPCs (`cancel_market_listing`, etc.). OK.
--
-- Verificado: las 465 funciones SECURITY DEFINER del proyecto son propiedad
-- de `postgres`, por lo que el bypass por owner funciona en todas ellas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Función trigger genérica: bloquea TODO UPDATE desde authenticated/anon
--    Se usa en tablas donde el cliente NUNCA debería hacer UPDATE directo
--    (todas las escrituras legítimas pasan por RPCs SECURITY DEFINER).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_game_table_full()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_cu text := current_user;
BEGIN
  -- Bypass para roles no expuestos al cliente (postgres, service_role, etc.)
  IF v_cu NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Bypass de emergencia compatible con el patrón existente.
  IF current_setting('fxu.allow_update_9x7k2m', true) = 'true' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'SECURITY_VIOLATION: Direct UPDATE on % from client is not allowed. Use the proper RPC. Code: GAME001',
    TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

ALTER FUNCTION public.protect_game_table_full() OWNER TO postgres;

COMMENT ON FUNCTION public.protect_game_table_full() IS
  'Bloquea UPDATE directo desde authenticated/anon. Las RPCs SECURITY DEFINER (owner=postgres) no son afectadas.';


-- ---------------------------------------------------------------------
-- 2) Triggers en tablas de BLOQUEO TOTAL
--    (nadie desde el cliente debería actualizar estas tablas jamás)
-- ---------------------------------------------------------------------

-- Recursos de planeta (metal, crystal, deuterium, storage, per_hour, percents)
DROP TRIGGER IF EXISTS protect_planet_resources_trigger ON public.planet_resources;
CREATE TRIGGER protect_planet_resources_trigger
  BEFORE UPDATE ON public.planet_resources
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Edificios (level, is_upgrading, upgrade_end_time)
DROP TRIGGER IF EXISTS protect_planet_buildings_trigger ON public.planet_buildings;
CREATE TRIGGER protect_planet_buildings_trigger
  BEFORE UPDATE ON public.planet_buildings
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Naves
DROP TRIGGER IF EXISTS protect_planet_ships_trigger ON public.planet_ships;
CREATE TRIGGER protect_planet_ships_trigger
  BEFORE UPDATE ON public.planet_ships
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Defensas
DROP TRIGGER IF EXISTS protect_planet_defenses_trigger ON public.planet_defenses;
CREATE TRIGGER protect_planet_defenses_trigger
  BEFORE UPDATE ON public.planet_defenses
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Tecnologías
DROP TRIGGER IF EXISTS protect_user_technologies_trigger ON public.user_technologies;
CREATE TRIGGER protect_user_technologies_trigger
  BEFORE UPDATE ON public.user_technologies
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Oficiales VIP
DROP TRIGGER IF EXISTS protect_user_officers_trigger ON public.user_officers;
CREATE TRIGGER protect_user_officers_trigger
  BEFORE UPDATE ON public.user_officers
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Cola de edificios (no se puede acelerar end_time)
DROP TRIGGER IF EXISTS protect_building_queue_trigger ON public.building_queue;
CREATE TRIGGER protect_building_queue_trigger
  BEFORE UPDATE ON public.building_queue
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Cola de investigación
DROP TRIGGER IF EXISTS protect_research_queue_trigger ON public.research_queue;
CREATE TRIGGER protect_research_queue_trigger
  BEFORE UPDATE ON public.research_queue
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Cola de astillero (naves/defensas en construcción)
DROP TRIGGER IF EXISTS protect_shipyard_queue_trigger ON public.shipyard_queue;
CREATE TRIGGER protect_shipyard_queue_trigger
  BEFORE UPDATE ON public.shipyard_queue
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Wallets (verificación y firma criptográfica)
DROP TRIGGER IF EXISTS protect_user_wallets_trigger ON public.user_wallets;
CREATE TRIGGER protect_user_wallets_trigger
  BEFORE UPDATE ON public.user_wallets
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();

-- Planetas (is_destroyed, fields_max, diameter, temp_*, galaxy/system/position, etc.)
-- El cliente nunca hace UPDATE directo; todo pasa por RPCs secure_rename_planet,
-- set_planet_autopilot_role, secure_abandon_colony, process_fleet_arrival…
DROP TRIGGER IF EXISTS protect_planets_trigger ON public.planets;
CREATE TRIGGER protect_planets_trigger
  BEFORE UPDATE ON public.planets
  FOR EACH ROW EXECUTE FUNCTION public.protect_game_table_full();


-- ---------------------------------------------------------------------
-- 3) Función trigger con PROTECCIÓN POR COLUMNA para `alliances`
--    El líder SÍ puede editar description/internal_text/is_open/logo_url
--    desde el cliente (flujo real en AlliancePage.tsx). Pero NO debe poder
--    tocar puntos, ranking, miembros, líder o tag.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_alliances_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_cu text := current_user;
  v_changed text;
BEGIN
  IF v_cu NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF current_setting('fxu.allow_update_9x7k2m', true) = 'true' THEN
    RETURN NEW;
  END IF;

  v_changed := NULL;
  IF NEW.points_total   IS DISTINCT FROM OLD.points_total   THEN v_changed := 'points_total'; END IF;
  IF v_changed IS NULL AND NEW.rank_position IS DISTINCT FROM OLD.rank_position THEN v_changed := 'rank_position'; END IF;
  IF v_changed IS NULL AND NEW.member_count  IS DISTINCT FROM OLD.member_count  THEN v_changed := 'member_count'; END IF;
  IF v_changed IS NULL AND NEW.founder_id    IS DISTINCT FROM OLD.founder_id    THEN v_changed := 'founder_id'; END IF;
  IF v_changed IS NULL AND NEW.leader_id     IS DISTINCT FROM OLD.leader_id     THEN v_changed := 'leader_id'; END IF;
  IF v_changed IS NULL AND NEW.tag           IS DISTINCT FROM OLD.tag           THEN v_changed := 'tag'; END IF;
  IF v_changed IS NULL AND NEW.name          IS DISTINCT FROM OLD.name          THEN v_changed := 'name'; END IF;
  IF v_changed IS NULL AND NEW.name_changed  IS DISTINCT FROM OLD.name_changed  THEN v_changed := 'name_changed'; END IF;
  IF v_changed IS NULL AND NEW.created_at    IS DISTINCT FROM OLD.created_at    THEN v_changed := 'created_at'; END IF;

  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION
      'SECURITY_VIOLATION: Direct modification of alliances.% is not allowed. Use the proper RPC. Code: ALLY001',
      v_changed
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_alliances_sensitive_columns() OWNER TO postgres;

DROP TRIGGER IF EXISTS protect_alliances_sensitive_trigger ON public.alliances;
CREATE TRIGGER protect_alliances_sensitive_trigger
  BEFORE UPDATE ON public.alliances
  FOR EACH ROW EXECUTE FUNCTION public.protect_alliances_sensitive_columns();


-- ---------------------------------------------------------------------
-- 4) Función trigger con PROTECCIÓN POR COLUMNA para `alliance_members`
--    Los oficiales SÍ pueden promocionar/degradar (flujo real en
--    AlliancePage.tsx). Pero NO deben poder cambiar user_id, alliance_id,
--    joined_at ni contributed_points (si existen).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_alliance_members_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_cu text := current_user;
  v_changed text;
BEGIN
  IF v_cu NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF current_setting('fxu.allow_update_9x7k2m', true) = 'true' THEN
    RETURN NEW;
  END IF;

  v_changed := NULL;
  IF NEW.user_id     IS DISTINCT FROM OLD.user_id     THEN v_changed := 'user_id'; END IF;
  IF v_changed IS NULL AND NEW.alliance_id IS DISTINCT FROM OLD.alliance_id THEN v_changed := 'alliance_id'; END IF;
  IF v_changed IS NULL AND NEW.joined_at   IS DISTINCT FROM OLD.joined_at   THEN v_changed := 'joined_at'; END IF;

  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION
      'SECURITY_VIOLATION: Direct modification of alliance_members.% is not allowed. Code: ALLY002',
      v_changed
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_alliance_members_sensitive_columns() OWNER TO postgres;

DROP TRIGGER IF EXISTS protect_alliance_members_sensitive_trigger ON public.alliance_members;
CREATE TRIGGER protect_alliance_members_sensitive_trigger
  BEFORE UPDATE ON public.alliance_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_alliance_members_sensitive_columns();


-- ---------------------------------------------------------------------
-- 5) Notas finales
--
-- - No se tocan policies RLS existentes (no hay DROP POLICY / CREATE POLICY).
--   Sólo se añaden triggers defensivos. Esto minimiza el riesgo de regresión.
--
-- - Las tablas con RLS pero sin policies de UPDATE (fleets, fleet_ships,
--   planet_*, battle_reports, jackpot_pools, etc.) ya están efectivamente
--   protegidas porque el RLS niega cualquier UPDATE desde authenticated.
--
-- - Bypass de emergencia por RPC: si alguna futura RPC NO SECURITY DEFINER
--   necesita escribir, puede hacer PERFORM set_config(
--     'fxu.allow_update_9x7k2m','true',true) al inicio.
-- =====================================================================
