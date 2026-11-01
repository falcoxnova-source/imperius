-- ============================================================================
-- Requisito: cuando a un usuario le quitan/pierde un planeta (abandono, ruinas,
-- agotamiento, borrado admin, etc.) y ya no tiene los recursos/naves para
-- entregar, CANCELAR automaticamente sus ofertas de VENTA activas de ese planeta.
--
-- Causa raiz: las ofertas de venta de recursos/naves NO retienen (escrow) los
-- items; quedan en el planeta hasta venderse. Si el planeta desaparece o cambia
-- de dueno, la oferta quedaba 'active' pero huerfana (imposible de cumplir).
--
-- Solucion: trigger AFTER UPDATE OR DELETE en planets que cancela las ofertas
-- activas ligadas al planeta cuando se elimina o se le quita el dueno.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_market_listings_on_planet_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_owner := OLD.user_id;
  ELSE
    -- UPDATE: solo actuar cuando el planeta pierde/cambia de dueno.
    IF OLD.user_id IS NULL OR (NEW.user_id IS NOT DISTINCT FROM OLD.user_id) THEN
      RETURN NEW;
    END IF;
    v_owner := OLD.user_id;
  END IF;

  UPDATE market_listings
     SET status = 'cancelled', updated_at = now()
   WHERE planet_id = OLD.id
     AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 AND v_owner IS NOT NULL
     AND EXISTS (SELECT 1 FROM profiles WHERE id = v_owner) THEN
    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_owner, v_owner,
      'Ventas canceladas automaticamente',
      'Se cancelaron ' || v_count || ' oferta(s) de venta en el mercado porque perdiste el planeta asociado y ya no dispones de los recursos o naves para entregarlas.',
      'system'
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_listings_on_planet_loss ON public.planets;
CREATE TRIGGER trg_cancel_listings_on_planet_loss
  AFTER UPDATE OR DELETE ON public.planets
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_market_listings_on_planet_loss();
