-- ============================================================================
-- FALCO-X UNIVERSO - RESET COMPLETO v4 (DELETE-only, sin TRUNCATE)
-- ============================================================================
-- Orden correcto: primero tablas dependientes (hojas), luego padres
-- ============================================================================

DO $$
DECLARE
    v_admin_id uuid;
    v_admin_username text := 'admin';
    v_admin_main_planet_id uuid;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'RESET COMPLETO DEL JUEGO v4 (DELETE)';
    RAISE NOTICE '============================================';

    -- PASO 1: Identificar admin
    SELECT id INTO v_admin_id FROM profiles
    WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;

    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM profiles
        WHERE username ILIKE '%admin%' OR username ILIKE '%falcocorp%'
        ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'No se encontro la cuenta admin';
    END IF;

    SELECT id INTO v_admin_main_planet_id FROM planets
    WHERE user_id = v_admin_id
    ORDER BY is_main_planet DESC, created_at ASC LIMIT 1;

    RAISE NOTICE 'Admin ID: %, Planeta: %', v_admin_id, COALESCE(v_admin_main_planet_id::text, 'N/A');

    -- ========================================================================
    -- FASE 1: Tablas sin FK a profiles (se vacian completamente)
    -- ========================================================================

    -- Anti-cheat
    DELETE FROM multiaccounting_reports;
    DELETE FROM suspicious_accounts;
    DELETE FROM account_interaction_log;
    DELETE FROM admin_account_deletions;

    -- Referidos (ANTES que market_transactions porque FK referral_commissions->market_transactions)
    DELETE FROM referral_commissions;

    -- Mercado (orden: dependientes primero)
    DELETE FROM market_transactions;
    DELETE FROM market_monthly_sales;
    DELETE FROM market_listings;
    DELETE FROM market_buy_offers;

    -- Alianzas (orden inverso)
    DELETE FROM alliance_diplomacy;
    DELETE FROM alliance_applications;
    DELETE FROM alliance_war_battle_log;
    DELETE FROM alliance_war_scores;
    DELETE FROM alliance_war_entries;
    DELETE FROM alliance_war_reserve_pool;
    DELETE FROM alliance_war_hall_of_fame;
    DELETE FROM alliance_wars;
    DELETE FROM alliance_members;
    DELETE FROM alliances;

    -- Flotas (dependientes primero)
    DELETE FROM fleet_ships;
    DELETE FROM acs_participants;
    DELETE FROM acs_fleets;
    DELETE FROM fleets;
    DELETE FROM fleet_restoration_log;

    -- Batallas
    DELETE FROM battle_reports;
    DELETE FROM attack_log;

    -- Mensajes
    DELETE FROM messages;
    DELETE FROM public_chat_messages;

    -- Debris
    DELETE FROM debris_fields;

    -- Sesiones
    DELETE FROM login_sessions;
    DELETE FROM email_verification_tokens;

    -- Wallets/Finanzas
    DELETE FROM wallet_transactions;
    DELETE FROM user_wallets;
    DELETE FROM internal_transfers;
    DELETE FROM fxu_transactions;
    DELETE FROM fxu_bonus_ledger;
    DELETE FROM fxu_referral_bonus_pending;
    DELETE FROM admin_withdrawals;
    DELETE FROM admin_revenue;
    DELETE FROM admin_expenses;

    -- Jackpot
    DELETE FROM jackpot_history;
    UPDATE jackpot SET balance = 0, total_contributed = 0, total_won = 0,
        last_winner_id = NULL, last_won_at = NULL, last_won_amount = 0;
    UPDATE jackpot_pools SET expedition_balance = 0, expedition_total = 0,
        monthly_balance = 0, monthly_total = 0, plus_balance = 0, plus_total = 0,
        destruction_balance = 0, destruction_total = 0;

    -- Plus
    DELETE FROM plus_commission_rewards;
    DELETE FROM plus_pending_rewards;
    DELETE FROM plus_commission_distributions;
    DELETE FROM plus_subscriptions;

    -- Rankings
    DELETE FROM monthly_ranking_rewards;
    DELETE FROM monthly_ranking_distributions;
    DELETE FROM social_ranking_rewards;
    DELETE FROM social_ranking_distributions;
    DELETE FROM destruction_ranking_rewards;
    DELETE FROM destruction_ranking_distributions;

    -- Supply boxes
    DELETE FROM supply_box_purchases;

    -- Hall of Fame
    DELETE FROM hall_of_fame_players;
    DELETE FROM hall_of_fame_alliances;
    DELETE FROM hall_of_fame_records;

    -- Lotería
    DELETE FROM lottery_tickets;
    DELETE FROM lottery_winners;
    DELETE FROM lottery_draws;

    -- Daily missions
    DELETE FROM daily_missions;

    -- Hero ship
    DELETE FROM hero_duels;
    DELETE FROM hero_ship_active_expedition;
    DELETE FROM hero_ship_expeditions;
    DELETE FROM hero_ship_items;
    DELETE FROM hero_item_market_listings;
    DELETE FROM hero_market_pool;
    DELETE FROM duel_resolve_queue;

    -- P2P
    DELETE FROM p2p_messages;
    DELETE FROM p2p_disputes;
    DELETE FROM p2p_ratings;
    DELETE FROM p2p_audit_log;
    DELETE FROM p2p_reputation;
    DELETE FROM p2p_orders;
    DELETE FROM p2p_offers;
    DELETE FROM p2p_user_payment_methods;

    -- Blueprints
    DELETE FROM blueprint_market_escrow;
    DELETE FROM ship_blueprints;
    DELETE FROM expedition_blueprint_drops;

    -- Cosméticos
    DELETE FROM user_cosmetic_purchases;
    DELETE FROM user_cosmetics;

    -- Foro
    DELETE FROM forum_posts;
    DELETE FROM forum_topics;

    -- Telegram
    DELETE FROM telegram_links;
    DELETE FROM telegram_task_rewards;

    -- Twitter
    DELETE FROM twitter_missions;
    DELETE FROM twitter_actions;
    DELETE FROM twitter_links;

    -- Otros registros
    DELETE FROM points_update_queue;
    DELETE FROM weekly_revenue_snapshots;
    DELETE FROM game_rounds;
    DELETE FROM user_heartbeats;
    DELETE FROM autopilot_events;

    -- Users (tablas con FK a profiles)
    DELETE FROM ai_planet_custom_orders;
    DELETE FROM user_active_bonuses;
    DELETE FROM user_daily_missions;
    DELETE FROM user_daily_streaks;
    DELETE FROM user_hero_ship_inventory;
    DELETE FROM user_hero_ships;
    DELETE FROM user_ship_blueprints;

    RAISE NOTICE 'Fase 1: Datos no-admin eliminados de ~100 tablas';

    -- ========================================================================
    -- FASE 2: Colas de construcción
    -- ========================================================================
    DELETE FROM building_queue;
    DELETE FROM shipyard_queue;
    DELETE FROM research_queue;

    -- ========================================================================
    -- FASE 3: Planetas (excepto admin)
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

    RAISE NOTICE 'Fase 3: Planetas de otros usuarios eliminados';

    -- ========================================================================
    -- FASE 4: Tecnologías y oficiales
    -- ========================================================================
    DELETE FROM user_technologies WHERE user_id != v_admin_id;
    DELETE FROM user_officers WHERE user_id != v_admin_id;

    -- ========================================================================
    -- FASE 5: Perfiles (excepto admin)
    -- ========================================================================
    DELETE FROM profiles WHERE id != v_admin_id;

    RAISE NOTICE 'Fase 5: Perfiles eliminados (excepto admin)';

    -- ========================================================================
    -- FASE 6: Resetear admin a cero
    -- ========================================================================
    ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger;
    ALTER TABLE profiles DISABLE TRIGGER sync_tung_balance_trigger;

    UPDATE profiles SET
        fxu_balance = 0, tung_balance = 0, usdt_balance = 0, dark_matter = 0,
        points_total = 0, points_buildings = 0, points_research = 0,
        points_fleet = 0, points_defense = 0, points_expedition = 0,
        rank_position = 0, rank_buildings = 0, rank_research = 0,
        rank_fleet = 0, rank_defense = 0, rank_expedition = 0,
        battles_won = 0, battles_draw = 0, battles_lost = 0,
        units_destroyed = 0, units_lost = 0,
        debris_metal_total = 0, debris_crystal_total = 0,
        is_banned = false, is_hidden = false,
        vacation_mode = false, vacation_mode_enabled_at = NULL,
        last_activity = now(), updated_at = now()
    WHERE id = v_admin_id;

    ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger;
    ALTER TABLE profiles ENABLE TRIGGER sync_tung_balance_trigger;

    UPDATE user_technologies SET level = 0, is_researching = false,
        research_start_time = NULL, research_end_time = NULL
    WHERE user_id = v_admin_id;

    RAISE NOTICE 'Fase 6: Stats del admin reseteadas a cero';

    -- ========================================================================
    -- FASE 7: Resetear planeta principal del admin
    -- ========================================================================
    IF v_admin_main_planet_id IS NOT NULL THEN
        UPDATE planet_resources SET
            metal = 500, crystal = 500, deuterium = 0,
            metal_per_hour = 30, crystal_per_hour = 15, deuterium_per_hour = 0,
            metal_storage = 10000, crystal_storage = 10000, deuterium_storage = 10000,
            energy_used = 0, energy_max = 0, last_update = now()
        WHERE planet_id = v_admin_main_planet_id;

        UPDATE planet_buildings SET level = 0, is_upgrading = false,
            upgrade_end_time = NULL
        WHERE planet_id = v_admin_main_planet_id;

        DELETE FROM planet_ships WHERE planet_id = v_admin_main_planet_id;
        DELETE FROM planet_defenses WHERE planet_id = v_admin_main_planet_id;

        UPDATE planets SET name = 'Planeta Principal', fields_used = 0,
            fields_max = 163, is_destroyed = false, is_main_planet = true,
            jump_gate_cooldown = NULL, last_update = now()
        WHERE id = v_admin_main_planet_id;

        RAISE NOTICE 'Fase 7: Planeta admin reseteado (500/500/0, edificios lvl 0)';
    END IF;

    -- ========================================================================
    -- FASE 8: Galaxy positions
    -- ========================================================================
    UPDATE galaxy_positions SET is_occupied = false, occupied_by = NULL;

    IF v_admin_main_planet_id IS NOT NULL THEN
        UPDATE galaxy_positions gp SET is_occupied = true, occupied_by = v_admin_main_planet_id
        FROM planets p
        WHERE p.id = v_admin_main_planet_id
          AND gp.galaxy = p.galaxy AND gp.solar_system = p.solar_system AND gp.position = p.position;
    END IF;

    -- ========================================================================
    -- VERIFICACIÓN FINAL
    -- ========================================================================
    RAISE NOTICE '============================================';
    RAISE NOTICE '✅ RESET COMPLETADO EXITOSAMENTE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Admin: % (ID: %)', v_admin_username, v_admin_id;
    RAISE NOTICE 'Planeta: %', COALESCE(v_admin_main_planet_id::text, 'N/A');
    RAISE NOTICE 'Recursos: 500 metal / 500 crystal / 0 deuterium';
    RAISE NOTICE 'Edificios: nivel 0 | Tecnologias: nivel 0';
    RAISE NOTICE 'Estadisticas: 0 | Puntos: 0 | Ranking: 0';
    RAISE NOTICE '🎮 Juego listo para empezar desde cero!';
    RAISE NOTICE '============================================';
END $$;
