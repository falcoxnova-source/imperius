-- Fix Bug #4: token transfers between accounts failed with HTTP 400.
-- Root cause: internal_transfers.token_type CHECK still allowed only the
-- pre-rebrand values ('FXU','USDT'). transfer_tokens() inserts 'TUNG', which
-- violated internal_transfers_token_type_check (SQLSTATE 23514) -> unhandled
-- exception -> PostgREST returned 400. Align it with wallet_transactions.
ALTER TABLE public.internal_transfers
  DROP CONSTRAINT IF EXISTS internal_transfers_token_type_check;

ALTER TABLE public.internal_transfers
  ADD CONSTRAINT internal_transfers_token_type_check
  CHECK (token_type = ANY (ARRAY['TUNG'::text, 'USDT'::text]));
