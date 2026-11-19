/*
  Imperium: el Heroe quedaba "en expedicion" para siempre.

  La expedicion solo se cerraba cuando el jugador pulsaba "Reclamar" en la
  pagina del Heroe. Si no lo hacia, send_fleet_with_hero, duelos, casino, etc.
  seguian viendo claimed = false y bloqueaban al Heroe aunque hubiera vuelto
  hace dias.

  Solucion: un job que, cuando la expedicion ya regreso, llama a la MISMA
  funcion claim_hero_expedition (misma XP, dano y botin) y avisa al jugador
  con un mensaje. No cambia ninguna regla del Heroe.
*/
CREATE OR REPLACE FUNCTION public._cron_auto_claim_hero_expeditions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_res jsonb;
  v_item jsonb;
  v_body text;
  v_n integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('_cron_auto_claim_hero_expeditions')) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT a.user_id, e.name AS expedition_name
    FROM hero_ship_active_expedition a
    LEFT JOIN hero_ship_expeditions e ON e.id = a.expedition_id
    WHERE a.claimed = false AND a.returns_at <= now()
    ORDER BY a.returns_at
    LIMIT 200
  LOOP
    BEGIN
      v_res := public.claim_hero_expedition(r.user_id);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_n := v_n + 1;
        v_body := 'Tu Héroe regresó de la expedición "' || COALESCE(r.expedition_name, 'Expedición') || '" y ya está en la base, listo para combatir.'
          || E'\n\n+' || COALESCE(v_res->>'xp_gained', '0') || ' XP'
          || E'\n-' || COALESCE(v_res->>'hp_damage', '0') || ' HP';
        FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_res->'items_found', '[]'::jsonb)) LOOP
          v_body := v_body || E'\nBotín: ' || COALESCE(v_item->>'name', 'Objeto')
            || ' (Nv.' || COALESCE(v_item->>'item_level', '1') || ')';
        END LOOP;
        INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
        VALUES (r.user_id, NULL, 'Tu Héroe ha regresado', v_body, 'system');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[HEROAUTOCLAIM] %: %', r.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public._cron_auto_claim_hero_expeditions() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('hero-expedition-auto-claim', '* * * * *', 'SELECT public._cron_auto_claim_hero_expeditions()');
