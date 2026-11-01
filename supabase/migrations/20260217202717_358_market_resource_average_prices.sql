/*
  # Market Resource Average Prices Function

  1. New Functions
    - `get_market_resource_prices()`: Returns the average FXU price per unit
      for metal, crystal, and deuterium based on active market listings.
      Uses interquartile mean (trims top and bottom 25% outliers) for a
      more accurate market price estimate.

  2. Returns
    - `resource_code` (text): 'metal', 'crystal', or 'deuterium'
    - `avg_price` (numeric): trimmed average price per unit in FXU
    - `listing_count` (integer): number of active listings considered
*/

CREATE OR REPLACE FUNCTION get_market_resource_prices()
RETURNS TABLE(resource_code text, avg_price numeric, listing_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      ml.item_code,
      ml.price_per_unit,
      ROW_NUMBER() OVER (PARTITION BY ml.item_code ORDER BY ml.price_per_unit) AS rn,
      COUNT(*) OVER (PARTITION BY ml.item_code) AS total
    FROM market_listings ml
    WHERE ml.status = 'active'
      AND ml.listing_type = 'resource'
      AND ml.item_code IN ('metal', 'crystal', 'deuterium')
  ),
  trimmed AS (
    SELECT
      r.item_code,
      r.price_per_unit
    FROM ranked r
    WHERE r.rn > (r.total * 0.25)
      AND r.rn <= (r.total * 0.75)
  )
  SELECT
    t.item_code AS resource_code,
    ROUND(COALESCE(AVG(t.price_per_unit), 0), 4) AS avg_price,
    COUNT(*)::integer AS listing_count
  FROM trimmed t
  GROUP BY t.item_code;
END;
$$;
