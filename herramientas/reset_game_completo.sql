-- ============================================================================
-- FALCO-X UNIVERSO - RESET COMPLETO DEL JUEGO
-- Generated: 2026-06-14
-- Description: 
--   - Preserva TODA la lógica del juego (funciones, triggers, configuraciones)
--   - Elimina TODOS los datos de usuarios y progreso
--   - Deja SOLO la cuenta admin (falcocorp/Admin) con todo en cero
--   - Listo para empezar un juego nuevo desde cero
-- ============================================================================

-- ⚠️  ADVERTENCIA: Este script es DESTRUCTIVO. Todos los datos de usuarios,
--     planetas, flotas, alianzas, mercado, etc. serán ELIMINADOS.
--     Solo se conserva la cuenta admin y la lógica/configuración del juego.
-- ============================================================================

DO $$
DECLARE
    v_admin_id uuid;
    v_admin_username text := 'admin';  -- Cambiar si el admin tiene otro username
    v_admin_main_planet_id uuid;
    v_total_deleted bigint;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'INICIANDO RESET COMPLETO DEL JUEGO';
    RAISE NOTICE '============================================';

    -- ========================================================================
    -- PASO 1: Identificar la cuenta admin
    -- ========================================================================
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE username = v_admin_username
       OR email = 'admin@falcox.net'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        -- Si no existe admin, buscar 'falcocorp'
        SELECT id INTO v_admin_id
        FROM profiles
        WHERE username ILIKE '%falcocorp%'
           OR username ILIKE '%admin%'
        LIMIT 1;
    END IF;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION '❌ No se encontró la cuenta admin. Verifica el username.';
    END IF;

    RAISE NOTICE '✅ Admin encontrado: % (UUID: %)', v_admin_username, v_admin_id;

    -- ========================================================================
    -- PASO 2: Deshabilitar triggers para evitar efectos cascada no deseados
    -- ========================================================================
    -- Deshabilitamos temporalmente los triggers de las tablas principales
    -- para acelerar el proceso y evitar side-effects
    ALTER TABLE profiles DISABLE TRIGGER ALL;
    ALTER TABLE planets DISABLE TRIGGER ALL;
    ALTER TABLE planet_resources DISABLE TRIGGER ALL;
    ALTER TABLE planet_buildings DISABLE TRIGGER ALL;
    ALTER TABLE planet_ships DISABLE TRIGGER ALL;
    ALTER TABLE planet_defenses DISABLE TRIGGER ALL;
    ALTER TABLE fleets DISABLE TRIGGER ALL;
    ALTER TABLE fleet_ships DISABLE TRIGGER ALL;
    ALTER TABLE alliances DISABLE TRIGGER ALL;
    ALTER TABLE alliance_members DISABLE TRIGGER ALL;
    ALTER TABLE messages DISABLE TRIGGER ALL;
    ALTER TABLE public_chat_messages DISABLE TRIGGER ALL;
    ALTER TABLE market_listings DISABLE TRIGGER ALL;
    ALTER TABLE market_transactions DISABLE TRIGGER ALL;
    ALTER TABLE market_buy_offers DISABLE TRIGGER ALL;
    ALTER TABLE battle_reports DISABLE TRIGGER ALL;
    ALTER TABLE attack_log DISABLE TRIGGER ALL;
    ALTER TABLE user_technologies DISABLE TRIGGER ALL;
    ALTER TABLE user_officers DISABLE TRIGGER ALL;
    ALTER TABLE building_queue DISABLE TRIGGER ALL;
    ALTER TABLE research_queue DISABLE TRIGGER ALL;
    ALTER TABLE shipyard_queue DISABLE TRIGGER ALL;
    ALTER TABLE acs_fleets DISABLE TRIGGER ALL;
    ALTER TABLE acs_participants DISABLE TRIGGER ALL;

    RAISE NOTICE '✅ Triggers deshabilitados temporalmente';

    -- ========================================================================
    -- PASO 3: ELIMINAR TODOS LOS DATOS DE USUARIOS EXCEPTO ADMIN
    -- ========================================================================

    -- 3.1 --- PLANETAS de otros usuarios (y sus dependientes) ---
    
    -- Primero eliminar recursos, edificios, naves y defensas de planetas NO admin
    DELETE FROM planet_resources WHERE planet_id IN (
        SELECT id FROM planets WHERE user_id != v_admin_id
    );
    DELETE FROM planet_buildings WHERE planet_id IN (
        SELECT id FROM planets WHERE user_id != v_admin_id
    );
    DELETE FROM planet_ships WHERE planet_id IN (
        SELECT id FROM planets WHERE user_id != v_admin_id
    );
    DELETE FROM planet_defenses WHERE planet_id IN (
        SELECT id FROM planets WHERE user_id != v_admin_id
    );
    DELETE FROM planets WHERE user_id != v_admin_id;

    RAISE NOTICE '✅ Planetas de otros usuarios eliminados';

    -- 3.2 --- COLAS de otros usuarios ---
    DELETE FROM building_queue WHERE planet_id IN (
        SELECT id FROM planets WHERE user_id != v_admin_id
    );
    DELETE FROM shipyard_queue WHERE planet_id IN (
        SELECT id FROM planets WHERE user_id != v_admin_id
    );
    DELETE FROM research_queue WHERE user_id != v_admin_id;

    RAISE NOTICE '✅ Colas de construcción/investigación eliminadas';

    -- 3.3 --- FLOTAS de otros usuarios ---
    DELETE FROM fleet_ships WHERE fleet_id IN (
        SELECT id FROM fleets WHERE user_id != v_admin_id
    );
    DELETE FROM acs_participants WHERE user_id != v_admin_id;
    DELETE FROM acs_fleets WHERE creator_id != v_admin_id;
    DELETE FROM fleets WHERE user_id != v_admin_id;

    RAISE NOTICE '✅ Flotas eliminadas';

    -- 3.4 --- BATALLAS ---
    DELETE FROM battle_reports WHERE attacker_id != v_admin_id AND defender_id != v_admin_id;
    DELETE FROM attack_log WHERE attacker_id != v_admin_id AND defender_id != v_admin_id;

    RAISE NOTICE '✅ Reportes de batalla eliminados';

    -- 3.5 --- ALIANZAS (eliminar todas y recrear después si se desea) ---
    DELETE FROM alliance_diplomacy;
    DELETE FROM alliance_applications;
    DELETE FROM alliance_members;
    DELETE FROM alliance_wars;
    DELETE FROM alliance_war_entries;
    DELETE FROM alliance_war_scores;
    DELETE FROM alliance_war_battle_log;
    DELETE FROM alliance_war_reserve_pool;
    DELETE FROM alliance_war_hall_of_fame;
    DELETE FROM alliances;

    RAISE NOTICE '✅ Alianzas eliminadas';

    -- 3.6 --- MENSAJES ---
    DELETE FROM messages;
    DELETE FROM public_chat_messages;

    RAISE NOTICE '✅ Mensajes eliminados';

    -- 3.7 --- MERCADO ---
    DELETE FROM market_transactions;
    DELETE FROM market_listings;
    DELETE FROM market_buy_offers;
    DELETE FROM market_monthly_sales;

    RAISE NOTICE '✅ Mercado limpiado';

    -- 3.8 --- DEBRIS ---
    DELETE FROM debris_fields;

    RAISE NOTICE '✅ Campos de escombros eliminados';

    -- 3.9 --- SESIONES Y VERIFICACIÓN ---
    DELETE FROM login_sessions;
    DELETE FROM email_verification_tokens;

    RAISE NOTICE '✅ Sesiones y tokens eliminados';

    -- 3.10 --- REFERIDOS ---
    DELETE FROM referral_commissions;

    RAISE NOTICE '✅ Comisiones de referidos eliminadas';

    -- 3.11 --- WALLETS ---
    DELETE FROM wallet_transactions;
    DELETE FROM user_wallets;
    DELETE FROM internal_transfers;

    RAISE NOTICE '✅ Wallets limpiados';

    -- 3.12 --- FINANZAS ADMIN ---
    DELETE FROM admin_withdrawals;
    DELETE FROM admin_revenue;
    DELETE FROM admin_expenses;

    RAISE NOTICE '✅ Finanzas admin limpiadas';

    -- 3.13 --- JACKPOT ---
    DELETE FROM jackpot_history;
    UPDATE jackpot SET balance = 0, total_contributed = 0, total_won = 0, 
        last_winner_id = NULL, last_won_at = NULL, last_won_amount = 0;
    UPDATE jackpot_pools SET 
        expedition_balance = 0, expedition_total = 0,
        monthly_balance = 0, monthly_total = 0,
        plus_balance = 0, plus_total = 0;

    RAISE NOTICE '✅ Jackpot reseteado';

    -- 3.14 --- PLUS / SUSCRIPCIONES ---
    DELETE FROM plus_commission_rewards;
    DELETE FROM plus_pending_rewards;
    DELETE FROM plus_commission_distributions;
    DELETE FROM plus_subscriptions;

    RAISE NOTICE '✅ Suscripciones Plus eliminadas';

    -- 3.15 --- RANKINGS MENSUALES ---
    DELETE FROM monthly_ranking_rewards;
    DELETE FROM monthly_ranking_distributions;

    RAISE NOTICE '✅ Rankings mensuales eliminados';

    -- 3.16 --- SOCIAL RANKING ---
    DELETE FROM social_ranking_rewards;
    DELETE FROM social_ranking_distributions;

    -- 3.17 --- DESTRUCTION RANKING ---
    DELETE FROM destruction_ranking_rewards;
    DELETE FROM destruction_ranking_distributions;

    RAISE NOTICE '✅ Rankings sociales y de destrucción eliminados';

    -- 3.18 --- SUPPLY BOXES ---
    DELETE FROM supply_box_purchases;

    RAISE NOTICE '✅ Compras de supply boxes eliminadas';

    -- 3.19 --- HALL OF FAME ---
    DELETE FROM hall_of_fame_players;
    DELETE FROM hall_of_fame_alliances;
    DELETE FROM hall_of_fame_records;

    RAISE NOTICE '✅ Hall of Fame limpiado';

    -- 3.20 --- TELEGRAM ---
    DELETE FROM telegram_links WHERE user_id != v_admin_id;
    DELETE FROM telegram_task_rewards WHERE user_id != v_admin_id;

    RAISE NOTICE '✅ Links de Telegram eliminados (excepto admin)';

    -- 3.21 --- TWITTER ---
    DELETE FROM twitter_links WHERE user_id != v_admin_id;
    DELETE FROM twitter_missions;
    DELETE FROM twitter_actions;

    RAISE NOTICE '✅ Datos de Twitter eliminados';

    -- 3.22 --- ANTI-CHEAT ---
    DELETE FROM account_interaction_log;
    DELETE FROM suspicious_accounts;
    DELETE FROM multiaccounting_reports;
    DELETE FROM admin_account_deletions;

    RAISE NOTICE '✅ Logs anti-cheat eliminados';

    -- 3.23 --- OTROS ---
    DELETE FROM fleet_restoration_log;
    DELETE FROM game_rounds;

    RAISE NOTICE '✅ Logs de restauración y rondas eliminados';

    -- 3.24 --- LOTTERY ---
    DELETE FROM lottery_tickets;
    DELETE FROM lottery_winners;
    DELETE FROM lottery_draws;

    RAISE NOTICE '✅ Lotería reseteada';

    -- 3.25 --- DAILY MISSIONS ---
    DELETE FROM daily_missions;

    RAISE NOTICE '✅ Misiones diarias eliminadas';

    -- 3.26 --- HERO SHIP ---
    DELETE FROM hero_ship_active_expedition;
    DELETE FROM hero_ship_expeditions;
    DELETE FROM hero_ship_items;
    DELETE FROM hero_market_pool;
    DELETE FROM hero_duels;

    RAISE NOTICE '✅ Hero Ship reseteado';

    -- 3.27 --- P2P MARKETPLACE ---
    DELETE FROM p2p_messages;
    DELETE FROM p2p_disputes;
    DELETE FROM p2p_ratings;
    DELETE FROM p2p_audit_log;
    DELETE FROM p2p_reputation;
    DELETE FROM p2p_orders;
    DELETE FROM p2p_offers;
    DELETE FROM p2p_user_payment_methods;

    RAISE NOTICE '✅ P2P Marketplace limpiado';

    -- 3.28 --- BLUEPRINTS ---
    DELETE FROM blueprint_market_escrow;
    DELETE FROM ship_blueprints;
    DELETE FROM expedition_blueprint_drops;

    RAISE NOTICE '✅ Blueprints eliminados';

    -- 3.29 --- COSMETICS ---
    DELETE FROM user_cosmetics;

    RAISE NOTICE '✅ Cosméticos de usuarios eliminados';

    -- 3.30 --- FORUM ---
    DELETE FROM forum_posts;
    DELETE FROM forum_topics;

    RAISE NOTICE '✅ Foro limpiado';

    -- 3.31 --- OTROS REGISTROS ---
    DELETE FROM points_update_queue;
    DELETE FROM weekly_revenue_snapshots;

    RAISE NOTICE '✅ Colas de puntos y revenue snapshots eliminados';

    -- 3.32 --- GALAXY POSITIONS (reset occupied) ---
    UPDATE galaxy_positions SET is_occupied = false, occupied_by = NULL;

    RAISE NOTICE '✅ Posiciones de galaxia reseteadas';

    -- ========================================================================
    -- PASO 4: ELIMINAR PERFILES DE USUARIOS (EXCEPTO ADMIN)
    -- ========================================================================
    DELETE FROM profiles WHERE id != v_admin_id;

    RAISE NOTICE '✅ Perfiles de usuarios eliminados (excepto admin)';

    -- ========================================================================
    -- PASO 5: RESETEAR LA CUENTA ADMIN A CERO
    -- ========================================================================

    -- 5.1 --- Resetear estadísticas del admin ---
    UPDATE profiles SET
        -- Balances
        fxu_balance = 0,
        usdt_balance = 0,
        dark_matter = 0,
        -- Puntos
        points_total = 0,
        points_buildings = 0,
        points_research = 0,
        points_fleet = 0,
        points_defense = 0,
        points_expedition = 0,
        -- Rankings
        rank_position = 0,
        rank_buildings = 0,
        rank_research = 0,
        rank_fleet = 0,
        rank_defense = 0,
        rank_expedition = 0,
        -- Batallas
        battles_won = 0,
        battles_draw = 0,
        battles_lost = 0,
        units_destroyed = 0,
        units_lost = 0,
        debris_metal_total = 0,
        debris_crystal_total = 0,
        -- Otros
        is_banned = false,
        is_hidden = false,
        vacation_mode = false,
        vacation_mode_enabled_at = NULL,
        last_activity = now(),
        updated_at = now()
    WHERE id = v_admin_id;

    RAISE NOTICE '✅ Estadísticas del admin reseteadas a cero';

    -- 5.2 --- Resetear el planeta principal del admin ---
    -- Buscar el planeta principal (o el único que quede)
    SELECT id INTO v_admin_main_planet_id
    FROM planets
    WHERE user_id = v_admin_id
    ORDER BY is_main_planet DESC, created_at ASC
    LIMIT 1;

    IF v_admin_main_planet_id IS NOT NULL THEN
        -- Resetear recursos del planeta a valores iniciales
        UPDATE planet_resources SET
            metal = 500,
            crystal = 500,
            deuterium = 0,
            metal_per_hour = 30,
            crystal_per_hour = 15,
            deuterium_per_hour = 0,
            metal_storage = 10000,
            crystal_storage = 10000,
            deuterium_storage = 10000,
            energy_used = 0,
            energy_max = 0,
            last_update = now()
        WHERE planet_id = v_admin_main_planet_id;

        -- Resetear nivel de edificios a 0
        UPDATE planet_buildings SET
            level = 0,
            is_upgrading = false,
            upgrade_end_time = NULL
        WHERE planet_id = v_admin_main_planet_id;

        -- Eliminar naves del planeta
        DELETE FROM planet_ships WHERE planet_id = v_admin_main_planet_id;

        -- Eliminar defensas del planeta
        DELETE FROM planet_defenses WHERE planet_id = v_admin_main_planet_id;

        -- Resetear campos
        UPDATE planets SET
            fields_used = 0,
            fields_max = 163,
            is_destroyed = false,
            jump_gate_cooldown = NULL,
            last_update = now()
        WHERE id = v_admin_main_planet_id;

        RAISE NOTICE '✅ Planeta principal del admin reseteado a estado inicial';
        RAISE NOTICE '   Planeta: % (ID: %)', 
            (SELECT name FROM planets WHERE id = v_admin_main_planet_id), 
            v_admin_main_planet_id;
    ELSE
        RAISE NOTICE '⚠️  El admin no tiene planeta principal. Se necesitará crear uno.';
    END IF;

    -- 5.3 --- Eliminar tecnologías del admin ---
    UPDATE user_technologies SET
        level = 0,
        is_researching = false,
        research_start_time = NULL,
        research_end_time = NULL
    WHERE user_id = v_admin_id;

    -- 5.4 --- Eliminar oficiales del admin ---
    DELETE FROM user_officers WHERE user_id = v_admin_id;

    -- 5.5 --- Eliminar colas del admin ---
    DELETE FROM building_queue WHERE planet_id = v_admin_main_planet_id;
    DELETE FROM shipyard_queue WHERE planet_id = v_admin_main_planet_id;
    DELETE FROM research_queue WHERE user_id = v_admin_id;

    -- 5.6 --- Eliminar flotas del admin ---
    DELETE FROM fleet_ships WHERE fleet_id IN (
        SELECT id FROM fleets WHERE user_id = v_admin_id
    );
    DELETE FROM acs_participants WHERE user_id = v_admin_id;
    DELETE FROM acs_fleets WHERE creator_id = v_admin_id;
    DELETE FROM fleets WHERE user_id = v_admin_id;

    -- 5.7 --- Eliminar batallas del admin ---
    DELETE FROM battle_reports WHERE attacker_id = v_admin_id OR defender_id = v_admin_id;
    DELETE FROM attack_log WHERE attacker_id = v_admin_id OR defender_id = v_admin_id;

    -- 5.8 --- Limpiar wallets del admin ---
    DELETE FROM wallet_transactions WHERE user_id = v_admin_id;
    DELETE FROM user_wallets WHERE user_id = v_admin_id;

    -- 5.9 --- Limpiar mercado del admin ---
    DELETE FROM market_transactions WHERE buyer_id = v_admin_id OR seller_id = v_admin_id;
    DELETE FROM market_listings WHERE seller_id = v_admin_id;
    DELETE FROM market_buy_offers WHERE seller_id = v_admin_id;

    -- 5.10 --- Limpiar hero ship del admin ---
    DELETE FROM hero_ship_active_expedition WHERE user_id = v_admin_id;
    DELETE FROM hero_ship_expeditions WHERE user_id = v_admin_id;
    DELETE FROM hero_ship_items WHERE user_id = v_admin_id;
    DELETE FROM hero_duels WHERE challenger_id = v_admin_id OR defender_id = v_admin_id;

    -- 5.11 --- Limpiar cosméticos del admin ---
    DELETE FROM user_cosmetics WHERE user_id = v_admin_id;

    -- 5.12 --- Limpiar blueprints del admin ---
    DELETE FROM ship_blueprints WHERE user_id = v_admin_id;
    DELETE FROM expedition_blueprint_drops WHERE user_id = v_admin_id;

    RAISE NOTICE '✅ Todos los datos del admin reseteados a cero';

    -- ========================================================================
    -- PASO 6: REACTIVAR TRIGGERS
    -- ========================================================================
    ALTER TABLE profiles ENABLE TRIGGER ALL;
    ALTER TABLE planets ENABLE TRIGGER ALL;
    ALTER TABLE planet_resources ENABLE TRIGGER ALL;
    ALTER TABLE planet_buildings ENABLE TRIGGER ALL;
    ALTER TABLE planet_ships ENABLE TRIGGER ALL;
    ALTER TABLE planet_defenses ENABLE TRIGGER ALL;
    ALTER TABLE fleets ENABLE TRIGGER ALL;
    ALTER TABLE fleet_ships ENABLE TRIGGER ALL;
    ALTER TABLE alliances ENABLE TRIGGER ALL;
    ALTER TABLE alliance_members ENABLE TRIGGER ALL;
    ALTER TABLE messages ENABLE TRIGGER ALL;
    ALTER TABLE public_chat_messages ENABLE TRIGGER ALL;
    ALTER TABLE market_listings ENABLE TRIGGER ALL;
    ALTER TABLE market_transactions ENABLE TRIGGER ALL;
    ALTER TABLE market_buy_offers ENABLE TRIGGER ALL;
    ALTER TABLE battle_reports ENABLE TRIGGER ALL;
    ALTER TABLE attack_log ENABLE TRIGGER ALL;
    ALTER TABLE user_technologies ENABLE TRIGGER ALL;
    ALTER TABLE user_officers ENABLE TRIGGER ALL;
    ALTER TABLE building_queue ENABLE TRIGGER ALL;
    ALTER TABLE research_queue ENABLE TRIGGER ALL;
    ALTER TABLE shipyard_queue ENABLE TRIGGER ALL;
    ALTER TABLE acs_fleets ENABLE TRIGGER ALL;
    ALTER TABLE acs_participants ENABLE TRIGGER ALL;

    RAISE NOTICE '✅ Triggers reactivados';

    -- ========================================================================
    -- PASO 7: MARCAR PLANETA DEL ADMIN COMO OCUPADO EN GALAXY
    -- ========================================================================
    IF v_admin_main_planet_id IS NOT NULL THEN
        UPDATE galaxy_positions gp
        SET is_occupied = true, occupied_by = v_admin_main_planet_id
        FROM planets p
        WHERE p.id = v_admin_main_planet_id
          AND gp.galaxy = p.galaxy
          AND gp.solar_system = p.solar_system
          AND gp.position = p.position;
        
        RAISE NOTICE '✅ Posición de galaxia del admin marcada como ocupada';
    END IF;

    -- ========================================================================
    -- PASO 8: VERIFICACIÓN FINAL
    -- ========================================================================
    RAISE NOTICE '============================================';
    RAISE NOTICE 'RESET COMPLETADO EXITOSAMENTE';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Resumen:';
    RAISE NOTICE '  - Admin: % (UUID: %)', v_admin_username, v_admin_id;
    RAISE NOTICE '  - Planeta principal: %', COALESCE(v_admin_main_planet_id::text, 'NO ENCONTRADO');
    RAISE NOTICE '  - Todos los demás usuarios eliminados';
    RAISE NOTICE '  - Toda la lógica del juego (funciones, triggers, config) preservada';
    RAISE NOTICE '  - Juego listo para empezar desde cero';
    RAISE NOTICE '============================================';
END $$;
