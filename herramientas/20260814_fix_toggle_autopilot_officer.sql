-- 2026-08-14: Arreglo puntual del toggle maestro del Piloto Automatico.
--
-- PROBLEMA: `toggle_autopilot` solo permitia activar si `autopilot_eligible` = true
-- (bandera que pone el admin a mano). Los jugadores que PAGAN el Oficial Androide
-- veian el panel (porque `has_autopilot_access` si cuenta el oficial) pero al pulsar
-- el interruptor maestro recibian "Piloto automatico no habilitado para esta cuenta".
--
-- SOLUCION: usar el mismo criterio que `has_autopilot_access` para ACTIVAR:
--   autopilot_eligible (admin)  OR  Oficial Androide vigente.
-- Desactivar se permite siempre (nadie debe quedar atrapado con el piloto encendido).
--
-- No cambia la firma ni el formato de respuesta -> no requiere recargar PostgREST.

BEGIN;

CREATE OR REPLACE FUNCTION public.toggle_autopilot(p_enable boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid      uuid;
  v_eligible boolean;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Apagar siempre se permite.
  IF NOT COALESCE(p_enable, false) THEN
    UPDATE profiles SET autopilot_active = false WHERE id = v_uid;
    RETURN json_build_object('success', true, 'active', false);
  END IF;

  SELECT autopilot_eligible INTO v_eligible FROM profiles WHERE id = v_uid;

  -- Encender: habilitado por admin O con Oficial Androide vigente (oficial pagado).
  IF NOT (COALESCE(v_eligible, false) OR public.has_active_officer(v_uid, 'android')) THEN
    RETURN json_build_object('success', false, 'error', 'Piloto automatico no habilitado para esta cuenta');
  END IF;

  UPDATE profiles SET autopilot_active = true WHERE id = v_uid;

  RETURN json_build_object('success', true, 'active', true);
END;
$function$;

COMMIT;
