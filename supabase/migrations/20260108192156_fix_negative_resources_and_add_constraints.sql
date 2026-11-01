/*
  # Corregir Recursos Negativos y Prevenir Futuros

  ## Paso 1: Corregir Datos Existentes
  Resetear todos los recursos negativos a 0

  ## Paso 2: Agregar Restricciones CHECK
  Prevenir que recursos se vuelvan negativos en el futuro

  ## Seguridad
  Esto garantiza que NUNCA los recursos puedan ser negativos, sin importar:
  - Condiciones de carrera
  - Validaciones que fallen
  - Bugs en el código
*/

-- ============================================================
-- PASO 1: Corregir recursos negativos existentes
-- ============================================================

UPDATE planet_resources
SET 
  metal = GREATEST(0, metal),
  crystal = GREATEST(0, crystal),
  deuterium = GREATEST(0, deuterium),
  energy_used = GREATEST(0, energy_used),
  energy_max = GREATEST(0, energy_max),
  last_update = now()
WHERE metal < 0 OR crystal < 0 OR deuterium < 0 OR energy_used < 0 OR energy_max < 0;

-- Corregir dark_matter negativo en profiles
UPDATE profiles
SET dark_matter = GREATEST(0, dark_matter)
WHERE dark_matter < 0;

-- ============================================================
-- PASO 2: Agregar restricciones CHECK
-- ============================================================

-- Add CHECK constraints to planet_resources table
ALTER TABLE planet_resources
ADD CONSTRAINT check_metal_non_negative CHECK (metal >= 0);

ALTER TABLE planet_resources
ADD CONSTRAINT check_crystal_non_negative CHECK (crystal >= 0);

ALTER TABLE planet_resources  
ADD CONSTRAINT check_deuterium_non_negative CHECK (deuterium >= 0);

ALTER TABLE planet_resources
ADD CONSTRAINT check_energy_used_non_negative CHECK (energy_used >= 0);

ALTER TABLE planet_resources
ADD CONSTRAINT check_energy_max_non_negative CHECK (energy_max >= 0);

-- Add CHECK constraint to profiles for dark_matter
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS check_dark_matter_non_negative;

ALTER TABLE profiles
ADD CONSTRAINT check_dark_matter_non_negative CHECK (dark_matter >= 0);

-- ============================================================
-- PASO 3: Función segura para descontar recursos con lock
-- ============================================================

CREATE OR REPLACE FUNCTION safe_deduct_resources(
  p_planet_id uuid,
  p_metal bigint,
  p_crystal bigint,
  p_deuterium bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resources RECORD;
BEGIN
  -- Get current resources with row lock (previene race conditions)
  SELECT metal, crystal, deuterium 
  INTO v_resources 
  FROM planet_resources 
  WHERE planet_id = p_planet_id
  FOR UPDATE;
  
  -- Check if we have enough resources
  IF v_resources.metal < p_metal OR 
     v_resources.crystal < p_crystal OR 
     v_resources.deuterium < p_deuterium THEN
    RETURN false;
  END IF;
  
  -- Deduct resources (CHECK constraints prevendrán valores negativos)
  UPDATE planet_resources
  SET 
    metal = metal - p_metal,
    crystal = crystal - p_crystal,
    deuterium = deuterium - p_deuterium,
    last_update = now()
  WHERE planet_id = p_planet_id;
  
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION safe_deduct_resources(uuid, bigint, bigint, bigint) TO authenticated;
