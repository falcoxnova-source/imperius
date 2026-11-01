CREATE OR REPLACE FUNCTION public.cancel_market_listing(p_listing_id uuid, p_return_planet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_listing record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada');
  END IF;
  
  IF v_listing.seller_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el dueno de esta oferta');
  END IF;
  
  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta ya no se puede cancelar');
  END IF;
  
  UPDATE market_listings
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_listing_id;
  
  IF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles
    SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
    WHERE id = v_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta cancelada exitosamente'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cancelar oferta: ' || SQLERRM);
END;
$function$

