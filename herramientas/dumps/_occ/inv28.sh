Q() { docker exec -i xnova-database psql -U postgres -d postgres -At -c "$1" < /dev/null; }
echo "== validate_ship_requirements"; Q "select prosrc from pg_proc where proname='validate_ship_requirements'"
echo "== validate_defense_requirements"; Q "select prosrc from pg_proc where proname='validate_defense_requirements'" | head -40
echo "== get_live_tung_price_usd volatility"; Q "select provolatile, prosecdef from pg_proc where proname='get_live_tung_price_usd'"
echo "== user_can_build_ship"; Q "select pg_get_functiondef('public.user_can_build_ship'::regproc)" | head -20
echo "== enforce_ship_blueprint_requirement"; Q "select pg_get_functiondef('public.enforce_ship_blueprint_requirement'::regproc)" | head -20
echo "== _bs_settle referral part"; Q "select prosrc from pg_proc where proname='_bs_settle'" | grep -n -i -A3 'referred_by\|referral_commissions\|record_admin_revenue\|is_admin'
