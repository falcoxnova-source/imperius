-- Batalla de Naves: nueva nave "Sonda de espionaje" (1 casilla).
-- Solo cambia la definicion de la flota; validacion, despliegue aleatorio y fin de partida la leen de aqui.
CREATE OR REPLACE FUNCTION public._bs_fleet()
RETURNS TABLE (code text, size integer, ord integer)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES ('deathstar', 5, 1), ('battlecruiser', 4, 2), ('cruiser', 3, 3), ('destroyer', 3, 4), ('light_fighter', 2, 5),
         ('espionage_probe', 1, 6);
$$;
