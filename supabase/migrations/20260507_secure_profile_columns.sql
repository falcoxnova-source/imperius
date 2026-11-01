-- =====================================================================
-- 20260507_secure_profile_columns.sql
-- Cierra vulnerabilidad crítica: usuarios autenticados podían actualizar
-- directamente vía PostgREST columnas sensibles de su propia fila en
-- `profiles` (usdt_balance, dark_matter, is_admin, is_banned), permitiendo
-- auto-acreditarse saldo, auto-promoverse a admin o auto-desbanearse.
--
-- Estrategia:
--  - Trigger BEFORE UPDATE que se aplica SOLO cuando current_user es
--    'authenticated' o 'anon' (ataques directos vía PostgREST).
--  - Dentro de funciones SECURITY DEFINER (propiedad de postgres) current_user
--    cambia al owner, por lo que TODAS las RPCs existentes siguen funcionando
--    sin modificación.
--  - Se mantiene además el guard de sesión `fxu.allow_update_9x7k2m` como
--    bypass compatible con el patrón ya existente de protect_fxu_balance.
--
-- Alcance:
--   - usdt_balance  (moneda real)
--   - dark_matter   (moneda premium)
--   - is_admin      (escalada de privilegios)
--   - is_banned     (auto-desbaneo)
--   - email_verified, is_bot, is_hidden (evita bypass anti-fraude)
--   - referred_by, referral_code (fraude de referidos)
--   - points_*, rank_*, battles_*, units_lost_*, debris_* (manipular ranking)
--   - autopilot_* (bypass de VIP)
--
-- Compatibilidad:
--   - No altera la policy RLS existente (no rompe lecturas ni updates legítimos
--     de columnas seguras como avatar_url, username, vacation_mode, notify_*).
--   - El trigger hace NO-OP si ninguna columna sensible cambia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Función del trigger defensivo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_cu      text := current_user;
  v_allowed text;
  v_changed text;
BEGIN
  -- Paso 1: si el caller NO es un rol expuesto a clientes, permitir siempre.
  -- Las funciones SECURITY DEFINER propiedad de `postgres` ejecutan con
  -- current_user='postgres', así que esto deja pasar todas las RPCs legítimas.
  IF v_cu NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Paso 2: compatibilidad con el patrón existente: si alguna RPC seteó el
  -- guard de sesión, permitir el cambio.
  v_allowed := current_setting('fxu.allow_update_9x7k2m', true);
  IF v_allowed = 'true' THEN
    RETURN NEW;
  END IF;

  -- Paso 3: detectar cualquier cambio en columnas sensibles y bloquear.
  v_changed := NULL;

  -- Económicas
  IF NEW.usdt_balance IS DISTINCT FROM OLD.usdt_balance THEN v_changed := 'usdt_balance'; END IF;
  IF v_changed IS NULL AND NEW.dark_matter IS DISTINCT FROM OLD.dark_matter THEN v_changed := 'dark_matter'; END IF;

  -- Privilegios / estado de cuenta
  IF v_changed IS NULL AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN v_changed := 'is_admin'; END IF;
  IF v_changed IS NULL AND NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN v_changed := 'is_banned'; END IF;
  IF v_changed IS NULL AND NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN v_changed := 'email_verified'; END IF;
  IF v_changed IS NULL AND NEW.is_bot IS DISTINCT FROM OLD.is_bot THEN v_changed := 'is_bot'; END IF;
  IF v_changed IS NULL AND NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN v_changed := 'is_hidden'; END IF;

  -- Referidos
  IF v_changed IS NULL AND NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN v_changed := 'referred_by'; END IF;
  IF v_changed IS NULL AND NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN v_changed := 'referral_code'; END IF;

  -- Ranking / stats (cheats de clasificación)
  IF v_changed IS NULL AND NEW.points_total     IS DISTINCT FROM OLD.points_total     THEN v_changed := 'points_total'; END IF;
  IF v_changed IS NULL AND NEW.points_buildings IS DISTINCT FROM OLD.points_buildings THEN v_changed := 'points_buildings'; END IF;
  IF v_changed IS NULL AND NEW.points_research  IS DISTINCT FROM OLD.points_research  THEN v_changed := 'points_research'; END IF;
  IF v_changed IS NULL AND NEW.points_fleet     IS DISTINCT FROM OLD.points_fleet     THEN v_changed := 'points_fleet'; END IF;
  IF v_changed IS NULL AND NEW.points_defense   IS DISTINCT FROM OLD.points_defense   THEN v_changed := 'points_defense'; END IF;
  IF v_changed IS NULL AND NEW.points_expedition IS DISTINCT FROM OLD.points_expedition THEN v_changed := 'points_expedition'; END IF;
  IF v_changed IS NULL AND NEW.rank_position    IS DISTINCT FROM OLD.rank_position    THEN v_changed := 'rank_position'; END IF;
  IF v_changed IS NULL AND NEW.rank_buildings   IS DISTINCT FROM OLD.rank_buildings   THEN v_changed := 'rank_buildings'; END IF;
  IF v_changed IS NULL AND NEW.rank_research    IS DISTINCT FROM OLD.rank_research    THEN v_changed := 'rank_research'; END IF;
  IF v_changed IS NULL AND NEW.rank_fleet       IS DISTINCT FROM OLD.rank_fleet       THEN v_changed := 'rank_fleet'; END IF;
  IF v_changed IS NULL AND NEW.rank_defense     IS DISTINCT FROM OLD.rank_defense     THEN v_changed := 'rank_defense'; END IF;
  IF v_changed IS NULL AND NEW.rank_expedition  IS DISTINCT FROM OLD.rank_expedition  THEN v_changed := 'rank_expedition'; END IF;
  IF v_changed IS NULL AND NEW.battles_won      IS DISTINCT FROM OLD.battles_won      THEN v_changed := 'battles_won'; END IF;
  IF v_changed IS NULL AND NEW.battles_lost     IS DISTINCT FROM OLD.battles_lost     THEN v_changed := 'battles_lost'; END IF;
  IF v_changed IS NULL AND NEW.battles_draw     IS DISTINCT FROM OLD.battles_draw     THEN v_changed := 'battles_draw'; END IF;
  IF v_changed IS NULL AND NEW.units_destroyed  IS DISTINCT FROM OLD.units_destroyed  THEN v_changed := 'units_destroyed'; END IF;
  IF v_changed IS NULL AND NEW.units_lost       IS DISTINCT FROM OLD.units_lost       THEN v_changed := 'units_lost'; END IF;
  IF v_changed IS NULL AND NEW.debris_metal_total   IS DISTINCT FROM OLD.debris_metal_total   THEN v_changed := 'debris_metal_total'; END IF;
  IF v_changed IS NULL AND NEW.debris_crystal_total IS DISTINCT FROM OLD.debris_crystal_total THEN v_changed := 'debris_crystal_total'; END IF;

  -- Autopilot / VIP (beneficios premium; 'autopilot_active' es toggleable por el usuario)
  IF v_changed IS NULL AND NEW.autopilot_eligible              IS DISTINCT FROM OLD.autopilot_eligible              THEN v_changed := 'autopilot_eligible'; END IF;
  IF v_changed IS NULL AND NEW.autopilot_vip_boost             IS DISTINCT FROM OLD.autopilot_vip_boost             THEN v_changed := 'autopilot_vip_boost'; END IF;
  IF v_changed IS NULL AND NEW.autopilot_vip_boost_expires_at  IS DISTINCT FROM OLD.autopilot_vip_boost_expires_at  THEN v_changed := 'autopilot_vip_boost_expires_at'; END IF;

  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION
      'SECURITY_VIOLATION: Direct modification of % is not allowed. Use the proper RPC. Code: PROF001',
      v_changed
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_sensitive_profile_columns() OWNER TO postgres;

-- ---------------------------------------------------------------------
-- 2) Trigger sobre profiles (idempotente)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS protect_sensitive_profile_columns_trigger ON public.profiles;
CREATE TRIGGER protect_sensitive_profile_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_sensitive_profile_columns();

-- ---------------------------------------------------------------------
-- 3) Nota sobre privilegios:
--    No se hace REVOKE por columna porque el GRANT UPDATE a nivel de tabla
--    lo anula (PostgreSQL no permite revocar un subset de columnas si el
--    privilegio se otorgó a nivel de tabla). El trigger es la defensa
--    efectiva y es consistente con el patrón existente de protect_fxu_balance.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4) Nota: fxu_balance ya está protegido por protect_fxu_balance_trigger.
--    Se mantiene intacto para no afectar la lógica existente.
-- ---------------------------------------------------------------------

COMMENT ON FUNCTION public.protect_sensitive_profile_columns() IS
  'Trigger BEFORE UPDATE que bloquea modificación directa de columnas sensibles de profiles desde roles authenticated/anon. Las RPCs SECURITY DEFINER (owner=postgres) no son afectadas porque current_user cambia al owner. Bypass de emergencia: set_config(''fxu.allow_update_9x7k2m'',''true'',true).';
