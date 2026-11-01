-- One-shot price change (do NOT re-run: it would apply a second 30% cut).
-- 1) Astillero Corporativo (instant_unit_offers) ships and defenses take the
--    CURRENT price of their blueprint.
-- 2) All blueprints (ships and defenses) become 30% cheaper.
-- Backups: /root/backups/*_prices_pre_bp30.csv

UPDATE public.instant_unit_offers o
SET price_usd = b.price_usd,
    updated_at = now()
FROM public.ship_blueprints b
WHERE (o.item_type = 'ship'    AND b.ship_type_id    = o.ship_type_id)
   OR (o.item_type = 'defense' AND b.defense_type_id = o.defense_type_id);

UPDATE public.ship_blueprints
SET price_usd = round(price_usd * 0.7, 4)
WHERE price_usd > 0;
