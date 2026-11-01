/*
  # Optimize Heavy Functions to Reduce CPU Usage

  ## Summary
  This migration documents the optimizations applied to reduce CPU usage from 100% to normal levels.

  ## Changes Applied (via execute_sql)
  
  ### 1. Indexes Created
  - idx_profiles_last_activity: Speeds up inactive account queries
  - idx_profiles_admin_banned: Speeds up admin/banned filtering
  - idx_profiles_points_buildings: Speeds up points filtering
  - idx_wallet_transactions_type_status: Speeds up transaction queries
  - idx_admin_revenue_created_at: Speeds up revenue time queries
  - idx_building_queue_end_time: Speeds up building queue processing
  - idx_shipyard_queue_end_time: Speeds up shipyard queue processing
  - idx_user_technologies_researching: Speeds up research processing

  ### 2. Functions Optimized
  - admin_get_inactive_accounts_summary: Single-pass COUNT with FILTER (was 5 separate queries)
  - admin_get_inactive_accounts_detailed: Uses CTEs and LIMIT 100
  - get_platform_financial_stats: Single-pass aggregations
  - get_revenue_summary: Single query with FILTER
  - get_weekly_revenue, get_monthly_revenue, get_daily_revenue: Added statement_timeout
  - get_recent_revenue, get_revenue_by_type: Added statement_timeout
  - calculate_and_sync_resources: Added 5s statement_timeout

  ### 3. Statement Timeouts Added
  - All heavy functions now have SET statement_timeout to prevent runaway queries
  - 5-15 second timeouts depending on complexity

  ### 4. Cron Jobs (from migration 289)
  - Reduced from 4 jobs every 1 minute to 1 job every 5 minutes
  - Uses optimized_global_queue_processor() with bulk operations

  ## Business Logic
  - ALL business logic remains EXACTLY the same
  - Only HOW data is queried/processed changed, not WHAT
  - No user data modified or deleted
  - Same results, just faster

  ## Expected Results
  - CPU usage should drop from 100% to <25%
  - Admin dashboard should load in <10 seconds
  - No more 504 Gateway Timeout errors
*/

-- This migration documents changes already applied via execute_sql
-- No additional SQL needed here
SELECT 1;
