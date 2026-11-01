-- ============================================================================
-- FALCO-X UNIVERSO - RESET COMPLETO DEL JUEGO (v2 - sin disable triggers)
-- Generated: 2026-06-14
-- Description: 
--   - Preserva TODA la lógica del juego (funciones, triggers, configuraciones)
--   - Elimina TODOS los datos de usuarios y progreso
--   - Deja SOLO la cuenta admin con todo en cero
--   - Listo para empezar un juego nuevo desde cero
-- ============================================================================

DO $$
DECLARE
    v_admin_id uuid;
    v_admin_username text := 'admin';
    v_admin_main_planet_id uuid;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'INICIANDO RESET COMPLETO DEL JUEGO v2';
    RAISE NOTICE '============================================';

    -- ========================================================================
    -- PASO 1: Identificar la cuenta admin
    -- ========================================================================
    SELECT id INTO v_admin_id FROM profiles
    WHERE is_admin = true
    ORDER BY created_at ASC LIMIT 1;

    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM profiles
        WHERE username ILIKE '%admin%' OR username ILIKE '%falcocorp%'
        ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'No se encontro la cuenta admin';
    END IF;

    RAISE NOTICE 'Admin encontrado: % (UUID: %)', v_admin_username, v_admin_id;

    -- Guardar el planeta principal del admin ANTES de borrar
    SELECT id INTO v_admin_main_planet_id FROM planets
    WHERE user_id = v_admin_id
    ORDER BY is_main_planet DESC, created_at ASC LIMIT 1;

    RAISE NOTICE 'Planeta principal admin: %', COALESCE(v_admin_main_planet_id::text, 'NO ENCONTRADO');

    -- ========================================================================
    -- PASO 2: TRUNCATE CASCADE - tablas que se vacían completamente
    -- ========================================================================

    -- Sesiones y verificación
    TRUNCATE TABLE login_sessions CASCADE;
    TRUNCATE TABLE email_verification_tokens CASCADE;

    -- Anti-cheat
    TRUNCATE TABLE account_interaction_log CASCADE;
    TRUNCATE TABLE suspicious_accounts CASCADE;
    TRUNCATE TABLE multiaccounting_reports CASCADE;
    TRUNCATE TABLE admin_account_deletions CASCADE;

    -- Mensajes
    TRUNCATE TABLE messages CASCADE;
    TRUNCATE TABLE public_chat_messages CASCADE;

    -- Mercado (primero dependientes)
    TRUNCATE TABLE market_transactions CASCADE;
    TRUNCATE TABLE market_monthly_sales CASCADE;
    TRUNCATE TABLE market_listings CASCADE;
    TRUNCATE TABLE market_buy_offers CASCADE;

    -- Alianzas (orden inverso de dependencias)
    TRUNCATE TABLE alliance_diplomacy CASCADE;
    TRUNCATE TABLE alliance_applications CASCADE;
    TRUNCATE TABLE alliance_war_battle_log CASCADE;
    TRUNCATE TABLE alliance_war_scores CASCADE;
    TRUNCATE TABLE alliance_war_entries CASCADE;
    TRUNCATE TABLE alliance_war_reserve_pool CASCADE;
    TRUNCATE TABLE alliance_war_hall_of_fame CASCADE;
    TRUNCATE TABLE alliance_wars CASCADE;
    TRUNCATE TABLE alliance_members CASCADE;
    TRUNCATE TABLE alliances CASCADE;

    -- Flotas (primero dependientes)
    TRUNCATE TABLE fleet_ships CASCADE;
    TRUNCATE TABLE acs_participants CASCADE;
    TRUNCATE TABLE acs_fleets CASCADE;
    TRUNCATE TABLE fleets CASCADE;
    TRUNCATE TABLE fleet_restoration_log CASCADE;

    -- Batallas
    TRUNCATE TABLE battle_reports CASCADE;
    TRUNCATE TABLE attack_log CASCADE;

    -- Debris
    TRUNCATE TABLE debris_fields CASCADE;

    -- Referidos
    TRUNCATE TABLE referral_commissions CASCADE;

    -- Wallets
    TRUNCATE TABLE wallet_transactions CASCADE;
    TRUNCATE TABLE user_wallets CASCADE;
    TRUNCATE TABLE internal_transfers CASCADE;

    -- Finanzas admin
    TRUNCATE TABLE admin_withdrawals CASCADE;
    TRUNCATE TABLE admin_revenue CASCADE;
    TRUNCATE TABLE admin_expenses CASCADE;

    -- Jackpot
    TRUNCATE TABLE jackpot_history CASCADE;

    -- Plus
    TRUNCATE TABLE plus_commission_rewards CASCADE;
    TRUNCATE TABLE plus_pending_rewards CASCADE;
    TRUNCATE TABLE plus_commission_distributions CASCADE;
    TRUNCATE TABLE plus_subscriptions CASCADE;

    -- Rankings
    TRUNCATE TABLE monthly_ranking_rewards CASCADE;
    TRUNCATE TABLE monthly_ranking_distributions CASCADE;
    TRUNCATE TABLE social_ranking_rewards CASCADE;
    TRUNCATE TABLE social_ranking_distributions CASCADE;
    TRUNCATE TABLE destruction_ranking_rewards CASCADE;
    TRUNCATE TABLE destruction_ranking_distributions CASCADE;

    -- Supply boxes
    TRUNCATE TABLE supply_box_purchases CASCADE;

    -- Hall of fame
    TRUNCATE TABLE hall_of_fame_players CASCADE;
    TRUNCATE TABLE hall_of_fame_alliances CASCADE;
    TRUNCATE TABLE hall_of_fame_records CASCADE;

    -- Telegram
    TRUNCATE TABLE telegram_task_rewards CASCADE;
    TRUNCATE TABLE telegram_links CASCADE;

    -- Twitter
    TRUNCATE TABLE twitter_missions CASCADE;
    TRUNCATE TABLE twitter_actions CASCADE;
    TRUNCATE TABLE twitter_links CASCADE;

    -- Lotería
    TRUNCATE TABLE lottery_tickets CASCADE;
    TRUNCATE TABLE lottery_winners CASCADE;
    TRUNCATE TABLE lottery_draws CASCADE;

    -- Daily missions
    TRUNCATE TABLE daily_missions CASCADE;

    -- Hero ship
    TRUNCATE TABLE hero_duels CASCADE;
    TRUNCATE TABLE hero_ship_active_expedition CASCADE;
    TRUNCATE TABLE hero_ship_expeditions CASCADE;
    TRUNCATE TABLE hero_ship_items CASCADE;
    TRUNCATE TABLE hero_market_pool CASCADE;

    -- P2P
    TRUNCATE TABLE p2p_messages CASCADE;
    TRUNCATE TABLE p2p_disputes CASCADE;
    TRUNCATE TABLE p2p_ratings CASCADE;
    TRUNCATE TABLE p2p_audit_log CASCADE;
    TRUNCATE TABLE p2p_reputation CASCADE;
    TRUNCATE TABLE p2p_orders CASCADE;
    TRUNCATE TABLE p2p_offers CASCADE;
    TRUNCATE TABLE p2p_user_payment_methods CASCADE;

    -- Blueprints
    TRUNCATE TABLE blueprint_market_escrow CASCADE;
    TRUNCATE TABLE ship_blueprints CASCADE;
    TRUNCATE TABLE expedition_blueprint_drops CASCADE;

    -- Cosméticos
    TRUNCATE TABLE user_cosmetics CASCADE;

    -- Foro
    TRUNCATE TABLE forum_posts CASCADE;
    TRUNCATE TABLE forum_topics CASCADE;

    -- Otros
    TRUNCATE TABLE points_update_queue CASCADE;
    TRUNCATE TABLE weekly_revenue_snapshots CASCADE;
    TRUNCATE TABLE game_rounds CASCADE;

    RAISE NOTICE 'Tablas truncadas con CASCADE (60+ tablas)';

    -- ========================================================================
    -- PASO 3: RESETEAR TABLAS DE CONFIGURACIÓN CON DATOS ACUMULATIVOS
    -- ========================================================================
    UPDATE jackpot SET balance = 0, total_contributed = 0, total_won = 0, 
        last_winner_id = NULL, last_won_at = NULL, last_won_amount = 0;
    UPDATE jackpot_pools SET 
        expedition_balance = 0, expedition_total = 0,
        monthly_balance = 0, monthly_total = 0,
        plus_balance = 0, plus_total = 0;

    -- ========================================================================
    -- PASO 4: BORRAR COLAS (dependen de planets/profiles que aun existen)
    -- ========================================================================
    DELETE FROM building_queue;
    DELETE FROM shipyard_queue;
    DELETE FROM research_queue;

    -- ========================================================================
    -- PASO 5: BORRAR PLANETAS Y SUS DEPENDENCIAS (excepto admin)
    -- ========================================================================
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

    RAISE NOTICE 'Planetas de otros usuarios eliminados';

    -- ========================================================================
    -- PASO 6: BORRAR TECHNOLOGÍAS Y OFICIALES (excepto admin)
    -- ========================================================================
    DELETE FROM user_technologies WHERE user_id != v_admin_id;
    DELETE FROM user_officers WHERE user_id != v_admin_id;

    -- ========================================================================
    -- PASO 7: BORRAR PERFILES (excepto admin)
    -- ========================================================================
    DELETE FROM profiles WHERE id != v_admin_id;

    RAISE NOTICE 'Perfiles de usuarios eliminados (excepto admin)';

    -- ========================================================================
    -- PASO 8: RESETEAR CUENTA ADMIN A CERO
    -- ========================================================================
    UPDATE profiles SET
        fxu_balance = 0,
        usdt_balance = 0,
        dark_matter = 0,
        points_total = 0,
        points_buildings = 0,
        points_research = 0,
        points_fleet = 0,
        points_defense = 0,
        points_expedition = 0,
        rank_position = 0,
        rank_buildings = 0,
        rank_research = 0,
        rank_fleet = 0,
        rank_defense = 0,
        rank_expedition = 0,
        battles_won = 0,
        battles_draw = 0,
        battles_lost = 0,
        units_destroyed = 0,
        units_lost = 0,
        debris_metal_total = 0,
        debris_crystal_total = 0,
        is_banned = false,
        is_hidden = false,
        vacation_mode = false,
        vacation_mode_enabled_at = NULL,
        last_activity = now(),
        updated_at = now()
    WHERE id = v_admin_id;

    -- Reset tecnologías del admin
    UPDATE user_technologies SET
        level = 0,
        is_researching = false,
        research_start_time = NULL,
        research_end_time = NULL
    WHERE user_id = v_admin_id;

    RAISE NOTICE 'Estadisticas del admin reseteadas a cero';

    -- ========================================================================
    -- PASO 9: RESETEAR PLANETA PRINCIPAL DEL ADMIN
    -- ========================================================================
    IF v_admin_main_planet_id IS NOT NULL THEN
        -- Resetear recursos
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

        -- Resetear edificios a nivel 0
        UPDATE planet_buildings SET
            level = 0,
            is_upgrading = false,
            upgrade_end_time = NULL
        WHERE planet_id = v_admin_main_planet_id;

        -- Eliminar naves y defensas del admin
        DELETE FROM planet_ships WHERE planet_id = v_admin_main_planet_id;
        DELETE FROM planet_defenses WHERE planet_id = v_admin_main_planet_id;

        -- Resetear planeta
        UPDATE planets SET
            name = 'Planeta Principal',
            fields_used = 0,
            fields_max = 163,
            is_destroyed = false,
            is_main_planet = true,
            jump_gate_cooldown = NULL,
            last_update = now()
        WHERE id = v_admin_main_planet_id;

        RAISE NOTICE 'Planeta principal del admin reseteado: recursos 500/500/0, edificios nivel 0';
    END IF;

    -- ========================================================================
    -- PASO 10: RESETEAR GALAXY POSITIONS
    -- ========================================================================
    UPDATE galaxy_positions SET is_occupied = false, occupied_by = NULL;

    -- Marcar solo el planeta del admin como ocupado
    IF v_admin_main_planet_id IS NOT NULL THEN
        UPDATE galaxy_positions gp SET is_occupied = true, occupied_by = v_admin_main_planet_id
        FROM planets p
        WHERE p.id = v_admin_main_planet_id
          AND gp.galaxy = p.galaxy
          AND gp.solar_system = p.solar_system
          AND gp.position = p.position;
    END IF;

    -- ========================================================================
    -- PASO 11: VERIFICACIÓN FINAL
    -- ========================================================================
    RAISE NOTICE '============================================';
    RAISE NOTICE 'RESET COMPLETADO EXITOSAMENTE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Admin: % (UUID: %)', v_admin_username, v_admin_id;
    RAISE NOTICE 'Planeta: %', COALESCE(v_admin_main_planet_id::text, 'NO ENCONTRADO');
    RAISE NOTICE 'Juego listo para empezar desde cero';
    RAISE NOTICE '============================================';
END $$;
