/*
  # Restore Market-Purchased Ships Removed by Migration 395

  1. Problem
    - Migration 395 removed ALL ships from players who couldn't build them
    - It did NOT distinguish between ships obtained via expeditions vs market purchases
    - Players who legitimately bought ships on the market lost them unfairly

  2. Changes
    - Restore ships to all players who purchased them via market_transactions
    - Ships are restored to each player's main planet (is_main_planet = true)
    - Only restores ships where: can_build = false AND current quantity = 0
    - Sends a notification message to each affected player
    - 36 ship restorations across ~25 players

  3. Important Notes
    - Market purchases are legitimate regardless of tech requirements
    - Expeditions remain restricted to ships the player can build
    - This is a one-time data correction
*/

DO $$
DECLARE
  v_record record;
  v_home_planet_id uuid;
  v_affected_users uuid[] := '{}';
  v_user_id uuid;
  v_total_restored integer := 0;
BEGIN
  FOR v_record IN
    SELECT 
      mt.buyer_id,
      st.id as ship_type_id,
      st.name as ship_name,
      SUM(mt.quantity)::integer as total_bought
    FROM market_transactions mt
    JOIN ship_types st ON st.code = mt.item_code
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(ps.quantity), 0) as current_quantity
      FROM planet_ships ps
      JOIN planets p ON p.id = ps.planet_id
      WHERE p.user_id = mt.buyer_id AND ps.ship_type_id = st.id
    ) ps_total ON true
    WHERE mt.item_type = 'ship'
      AND NOT user_can_build_ship(mt.buyer_id, st.id)
      AND COALESCE(ps_total.current_quantity, 0) = 0
    GROUP BY mt.buyer_id, st.id, st.name
  LOOP
    SELECT p.id INTO v_home_planet_id
    FROM planets p
    WHERE p.user_id = v_record.buyer_id AND p.is_main_planet = true
    LIMIT 1;

    IF v_home_planet_id IS NULL THEN
      SELECT p.id INTO v_home_planet_id
      FROM planets p
      WHERE p.user_id = v_record.buyer_id
      ORDER BY p.created_at ASC
      LIMIT 1;
    END IF;

    IF v_home_planet_id IS NOT NULL THEN
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (v_home_planet_id, v_record.ship_type_id, v_record.total_bought)
      ON CONFLICT (planet_id, ship_type_id)
      DO UPDATE SET quantity = planet_ships.quantity + v_record.total_bought;

      v_total_restored := v_total_restored + v_record.total_bought;

      IF NOT v_record.buyer_id = ANY(v_affected_users) THEN
        v_affected_users := array_append(v_affected_users, v_record.buyer_id);
      END IF;
    END IF;
  END LOOP;

  FOREACH v_user_id IN ARRAY v_affected_users
  LOOP
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_user_id,
      'Restauracion de Naves - Compras del Mercado',
      'Estimado comandante,' || E'\n\n' ||
      'Hemos detectado que durante el mantenimiento anterior del servidor, ' ||
      'algunas naves que compraste legitimamente en el Mercado fueron removidas por error.' || E'\n\n' ||
      'Todas tus naves compradas en el Mercado han sido restauradas a tu planeta principal.' || E'\n\n' ||
      'Nos disculpamos por las molestias. Las compras en el Mercado son completamente validas ' ||
      'independientemente de tu nivel tecnologico.' || E'\n\n' ||
      'Comando Estelar',
      'system'
    );
  END LOOP;

  RAISE NOTICE 'Restauracion completada: % naves restauradas a % jugadores',
    v_total_restored, array_length(v_affected_users, 1);
END $$;
