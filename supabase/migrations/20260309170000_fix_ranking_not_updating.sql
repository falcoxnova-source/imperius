/*
  # Fix Ranking Not Updating

  1. Rankings only recalculated when cron processes queue items (buildings/ships/research/fleets).
     If nothing completes, rankings stay stale indefinitely.
     FIX: Remove conditional — always recalculate rankings on every cron run.

  2. Duplicate `process-pending-fleets` cron job (migration 308) processes fleets BEFORE the
     main cron sees them, causing v_fleet_count = 0 frequently, aggravating issue #1.
     FIX: Unschedule the duplicate job.

  3. Ranking CTE missing `WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE` filter,
     so admin/hidden users occupy ranking positions and displace real players.
     FIX: Add the filter.

  4. `rank_expedition` not updated by cron (was in the old update_all_rankings function
     but lost when ranking moved into optimized_global_queue_processor).
     FIX: Add rank_expedition to the ranking CTE and UPDATE.

  SCOPE: Only modifies the ranking section of optimized_global_queue_processor
         and removes the duplicate cron job. No schema, column, or game logic changes.
*/

-- Fix 1: Remove duplicate fleet cron job that steals processing from main cron
DO $$
BEGIN
  PERFORM cron.unschedule('process-pending-fleets');
  RAISE NOTICE 'Unscheduled duplicate process-pending-fleets cron job';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'process-pending-fleets cron job not found or already removed: %', SQLERRM;
END $$;

-- Fix 2-4: Patch ranking section of optimized_global_queue_processor
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'optimized_global_queue_processor'
  AND pronargs = 0;

  IF v_src IS NULL THEN
    RAISE NOTICE 'optimized_global_queue_processor not found, skipping';
    RETURN;
  END IF;

  -- Fix 2: Remove conditional guard — rankings must recalculate on every cron run
  -- even when no queue items were processed (combat, FXU purchases, etc. change points)
  v_src := replace(v_src,
    'IF v_building_count > 0 OR v_shipyard_count > 0 OR v_research_count > 0 OR v_fleet_count > 0 THEN
      WITH ranked',
    'WITH ranked');

  -- Fix 3: Add expedition ranking to CTE + filter out admin/hidden users
  v_src := replace(v_src,
    'ROW_NUMBER() OVER (ORDER BY points_defense DESC, created_at ASC) as rank_d
        FROM profiles
      )',
    'ROW_NUMBER() OVER (ORDER BY points_defense DESC, created_at ASC) as rank_d,
          ROW_NUMBER() OVER (ORDER BY COALESCE(points_expedition, 0) DESC, created_at ASC) as rank_e
        FROM profiles
        WHERE is_admin IS NOT TRUE AND is_hidden IS NOT TRUE
      )');

  -- Fix 4: Add rank_expedition to UPDATE + remove orphaned END IF
  v_src := replace(v_src,
    'rank_defense = r.rank_d
      FROM ranked r
      WHERE p.id = r.id;
    END IF;',
    'rank_defense = r.rank_d,
        rank_expedition = r.rank_e
      FROM ranked r
      WHERE p.id = r.id;');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION optimized_global_queue_processor() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'fix_ranking: always recalculate, filter admin/hidden, add expedition rank';
END $$;
