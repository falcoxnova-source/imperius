/*
  # Mejorar Reportes de Batalla con Detalle de Unidades

  1. Propósito
    - Mostrar detalle completo de unidades en reportes de batalla
    - Incluir cantidades iniciales y sobrevivientes
    - Mostrar pérdidas específicas por tipo de unidad
    - Estilo XNova original

  2. Cambios
    - Nueva función helper para formatear reportes de unidades
    - Actualizar reportes de batalla para incluir detalle
    - Mostrar comparación antes/después del combate
*/

-- Función helper para generar reporte detallado de unidades
CREATE OR REPLACE FUNCTION format_unit_report(
  p_initial_units jsonb,
  p_remaining_units jsonb,
  p_side text
)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_report text := '';
  v_initial jsonb;
  v_remaining jsonb;
  v_initial_qty integer;
  v_remaining_qty integer;
  v_unit_name text;
  v_type_id integer;
BEGIN
  -- Iterar sobre unidades iniciales
  FOR v_initial IN SELECT * FROM jsonb_array_elements(p_initial_units)
  LOOP
    v_unit_name := v_initial->>'name';
    v_type_id := (v_initial->>'type_id')::integer;
    v_initial_qty := (v_initial->>'initial_quantity')::integer;
    
    -- Buscar cantidad sobreviviente
    SELECT (v_remaining->>'quantity')::integer INTO v_remaining_qty
    FROM jsonb_array_elements(p_remaining_units) AS v_remaining
    WHERE (v_remaining->>'type_id')::integer = v_type_id
    LIMIT 1;
    
    v_remaining_qty := COALESCE(v_remaining_qty, 0);
    
    -- Solo agregar si hubo unidades
    IF v_initial_qty > 0 THEN
      IF v_report != '' THEN
        v_report := v_report || E'\n';
      END IF;
      
      IF v_remaining_qty = 0 THEN
        -- Todas destruidas
        v_report := v_report || format('  %s: %s -> 0 (-%s)', 
          v_unit_name, v_initial_qty, v_initial_qty);
      ELSIF v_remaining_qty < v_initial_qty THEN
        -- Algunas destruidas
        v_report := v_report || format('  %s: %s -> %s (-%s)', 
          v_unit_name, v_initial_qty, v_remaining_qty, v_initial_qty - v_remaining_qty);
      ELSE
        -- Todas sobrevivieron
        v_report := v_report || format('  %s: %s (sin perdidas)', 
          v_unit_name, v_initial_qty);
      END IF;
    END IF;
  END LOOP;
  
  IF v_report = '' THEN
    v_report := '  Ninguna';
  END IF;
  
  RETURN v_report;
END;
$$;

GRANT EXECUTE ON FUNCTION format_unit_report(jsonb, jsonb, text) TO authenticated;
