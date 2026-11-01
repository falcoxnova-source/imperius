CREATE OR REPLACE FUNCTION public.admin_list_instant_unit_offers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'item_type', (x->>'sort_order')::int, x->>'name'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'code',            o.code,
      'item_type',       o.item_type,
      'ship_type_id',    o.ship_type_id,
      'defense_type_id', o.defense_type_id,
      'name',            COALESCE(NULLIF(o.name, ''), st.name, dt.name),
      'description',     o.description,
      'image_url',       COALESCE(NULLIF(o.image_url, ''), st.image_url, dt.image_url),
      'price_usd',       o.price_usd,
      'max_per_order',   o.max_per_order,
      'is_active',       o.is_active,
      'sort_order',      o.sort_order,
      'blueprint_price_usd', b.price_usd,
      'sold_units',      COALESCE(s.units, 0),
      'sold_tung',       COALESCE(s.tung, 0)
    ) AS x
    FROM instant_unit_offers o
    LEFT JOIN ship_types    st ON st.id = o.ship_type_id
    LEFT JOIN defense_types dt ON dt.id = o.defense_type_id
    LEFT JOIN ship_blueprints b
      ON (o.ship_type_id    IS NOT NULL AND b.ship_type_id    = o.ship_type_id)
      OR (o.defense_type_id IS NOT NULL AND b.defense_type_id = o.defense_type_id)
    LEFT JOIN LATERAL (
      SELECT SUM(quantity)::bigint AS units, SUM(cost_tung)::numeric AS tung
      FROM instant_unit_purchases ip WHERE ip.offer_code = o.code
    ) s ON true
  ) q;

  RETURN jsonb_build_object('success', true, 'offers', v_rows);
END;
$function$

