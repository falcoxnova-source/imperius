-- =====================================================================
-- FIX: la produccion seguia acumulandose cuando el planeta estaba POR
-- ENCIMA de la capacidad de almacen (barra en rojo / "LLENO").
--
-- Codigo original en calculate_planet_resources:
--     IF v_resources.metal <= v_metal_storage THEN
--       v_new_metal := LEAST(v_new_metal, v_metal_storage);
--     END IF;
--
-- El guard existia para NO destruir el excedente que llega por flotas,
-- mercado, etc. Pero al saltarse el clamp, la mina seguia produciendo
-- sin limite mientras el planeta estuviera sobrecargado.
--
-- Nuevo comportamiento (misma regla de negocio, sin perdida de recursos):
--     IF v_new_metal > v_metal_storage THEN
--       v_new_metal := GREATEST(v_metal_storage, v_resources.metal);
--     END IF;
--
--   * Por debajo del tope  -> se sigue limitando exactamente al tope (igual que antes).
--   * En el tope o por encima -> se congela en el valor actual: no produce mas,
--     pero tampoco se borra el excedente ya existente.
--
-- Parche textual sobre la definicion desplegada: no reescribe el cuerpo de
-- la funcion, solo sustituye esas 6 lineas. El resto (energia, VIP, bonus
-- de misiones, agotamiento de depositos, porcentajes) queda intacto.
-- =====================================================================

DO $do$
DECLARE
  v_def   text;
  v_orig  text;
  v_pairs text[][] := ARRAY[
    ['IF v_resources.metal <= v_metal_storage THEN',
     'IF v_new_metal > v_metal_storage THEN'],
    ['v_new_metal := LEAST(v_new_metal, v_metal_storage);',
     'v_new_metal := GREATEST(v_metal_storage, v_resources.metal);'],
    ['IF v_resources.crystal <= v_crystal_storage THEN',
     'IF v_new_crystal > v_crystal_storage THEN'],
    ['v_new_crystal := LEAST(v_new_crystal, v_crystal_storage);',
     'v_new_crystal := GREATEST(v_crystal_storage, v_resources.crystal);'],
    ['IF v_resources.deuterium <= v_deuterium_storage THEN',
     'IF v_new_deuterium > v_deuterium_storage THEN'],
    ['v_new_deuterium := LEAST(v_new_deuterium, v_deuterium_storage);',
     'v_new_deuterium := GREATEST(v_deuterium_storage, v_resources.deuterium);']
  ];
  i int;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'calculate_planet_resources';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'No se encontro public.calculate_planet_resources';
  END IF;

  v_orig := v_def;

  FOR i IN 1 .. array_length(v_pairs, 1) LOOP
    IF position(v_pairs[i][1] IN v_def) = 0 THEN
      RAISE EXCEPTION 'Patron no encontrado (la funcion ya fue modificada?): %', v_pairs[i][1];
    END IF;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  END LOOP;

  IF v_def = v_orig THEN
    RAISE EXCEPTION 'No se aplico ningun cambio';
  END IF;

  EXECUTE v_def;
  RAISE NOTICE 'calculate_planet_resources parcheada correctamente';
END
$do$;

-- Verificacion
SELECT 'OK: clamp corregido' AS resultado
WHERE EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'calculate_planet_resources'
    AND p.prosrc LIKE '%GREATEST(v_metal_storage, v_resources.metal)%'
    AND p.prosrc LIKE '%GREATEST(v_crystal_storage, v_resources.crystal)%'
    AND p.prosrc LIKE '%GREATEST(v_deuterium_storage, v_resources.deuterium)%'
);
