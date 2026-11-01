/*
  # Track Transport Interactions for Anti-Multicuenta
  
  Agrega un trigger para registrar automaticamente las interacciones
  de transporte de recursos entre jugadores.
  
  1. Cambios:
    - Modifica process_fleet_arrival para registrar transportes en account_interaction_log
    - Esto permite detectar patrones de pushing/multicuenta
*/

-- Function to log transport interaction (called from fleet processing)
CREATE OR REPLACE FUNCTION log_transport_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_planet RECORD;
  v_target_user_id uuid;
BEGIN
  IF NEW.is_completed = true AND OLD.is_completed = false 
     AND NEW.mission_type = 'transport' 
     AND NEW.is_returning = false THEN
    
    SELECT p.user_id INTO v_target_user_id
    FROM planets p
    WHERE p.galaxy = NEW.target_galaxy
      AND p.solar_system = NEW.target_system
      AND p.position = NEW.target_position
      AND p.planet_type = COALESCE(NEW.target_type, 'planet')
    LIMIT 1;
    
    IF v_target_user_id IS NOT NULL AND v_target_user_id != NEW.user_id THEN
      INSERT INTO account_interaction_log (
        from_user_id,
        to_user_id,
        interaction_type,
        metal_amount,
        crystal_amount,
        deuterium_amount
      ) VALUES (
        NEW.user_id,
        v_target_user_id,
        'transport',
        COALESCE(NEW.cargo_metal, 0),
        COALESCE(NEW.cargo_crystal, 0),
        COALESCE(NEW.cargo_deuterium, 0)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_transport_interaction ON fleets;

CREATE TRIGGER trigger_log_transport_interaction
  AFTER UPDATE ON fleets
  FOR EACH ROW
  WHEN (NEW.is_completed = true AND OLD.is_completed = false)
  EXECUTE FUNCTION log_transport_interaction();

-- Also track market transactions
CREATE OR REPLACE FUNCTION log_market_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.buyer_id != NEW.seller_id THEN
    INSERT INTO account_interaction_log (
      from_user_id,
      to_user_id,
      interaction_type,
      metal_amount,
      crystal_amount,
      deuterium_amount
    ) VALUES (
      NEW.buyer_id,
      NEW.seller_id,
      'market_sale',
      0,
      0,
      0
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_market_interaction ON market_transactions;

CREATE TRIGGER trigger_log_market_interaction
  AFTER INSERT ON market_transactions
  FOR EACH ROW
  EXECUTE FUNCTION log_market_interaction();
