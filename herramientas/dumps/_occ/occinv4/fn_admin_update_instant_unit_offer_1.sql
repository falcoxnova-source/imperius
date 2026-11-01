CREATE OR REPLACE FUNCTION public.admin_update_instant_unit_offer(p_code text, p_price_usd numeric DEFAULT NULL::numeric, p_is_active boolean DEFAULT NULL::boolean, p_max_per_order integer DEFAULT NULL::integer, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_sort_order integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  IF p_price_usd IS NOT NULL AND p_price_usd < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El precio USD no puede ser negativo');
  END IF;

  IF p_max_per_order IS NOT NULL AND (p_max_per_order < 1 OR p_max_per_order > 100000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tope por pedido fuera de rango (1-100000)');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM instant_unit_offers WHERE code = p_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unidad no encontrada');
  END IF;

  UPDATE instant_unit_offers
  SET price_usd     = COALESCE(p_price_usd, price_usd),
      is_active     = COALESCE(p_is_active, is_active),
      max_per_order = COALESCE(p_max_per_order, max_per_order),
      name          = COALESCE(NULLIF(p_name, ''), name),
      description   = COALESCE(p_description, description),
      image_url     = CASE WHEN p_image_url IS NULL THEN image_url
                           WHEN p_image_url = ''    THEN NULL
                           ELSE p_image_url END,
      sort_order    = COALESCE(p_sort_order, sort_order),
      updated_at    = now()
  WHERE code = p_code;

  RETURN jsonb_build_object('success', true, 'message', 'Unidad actualizada');
END;
$function$

