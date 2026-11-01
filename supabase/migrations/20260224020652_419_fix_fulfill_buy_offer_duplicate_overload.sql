/*
  # Fix fulfill_buy_offer duplicate function overload

  1. Problem
    - Two versions of `fulfill_buy_offer` exist: one with `p_quantity integer` and another with `p_quantity bigint`
    - When the frontend calls the function with a number, PostgreSQL cannot determine which overload to use
    - This causes "ambiguous function call" errors for users trying to fulfill buy offers

  2. Fix
    - Drop the older `integer` version of the function
    - Keep only the `bigint` version which is the most recent and correct one
*/

DROP FUNCTION IF EXISTS public.fulfill_buy_offer(uuid, integer, uuid);
