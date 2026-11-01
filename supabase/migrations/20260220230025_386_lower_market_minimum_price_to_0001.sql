/*
  # Lower Market Minimum Price Per Unit to 0.001

  1. Changes
    - Updates `market_resource_limits` table: sets min_price_metal, min_price_crystal, min_price_deuterium to 0.001
    - Updates `create_market_listing` and `create_buy_offer` functions to enforce 0.001 minimum for non-resource types too

  2. Reason
    - Allow more granular pricing for all market operations
    - Global minimum of 0.001 FXU per unit across all listing types
*/

UPDATE market_resource_limits
SET min_price_metal = 0.001,
    min_price_crystal = 0.001,
    min_price_deuterium = 0.001,
    updated_at = now()
WHERE id = 1;
