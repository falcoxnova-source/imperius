/*
  # Fix admin_revenue RLS Policy Security Issue

  1. Security Changes
    - Drop the overly permissive INSERT policy on admin_revenue
    - Revenue records should only be inserted by SECURITY DEFINER functions, not directly by users
    - The table remains protected: only admins can SELECT, no direct INSERT/UPDATE/DELETE by users

  2. Notes
    - All revenue tracking happens through database functions with SECURITY DEFINER
    - These functions bypass RLS, so no INSERT policy is needed for the table
*/

DROP POLICY IF EXISTS "System can insert revenue" ON admin_revenue;
