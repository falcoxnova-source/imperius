/*
  # Fix research_queue status constraint for Commander 2-slot queue

  ## Problem
  The RPC `secure_start_research` and related logic (`secure_cancel_queued_research`,
  `complete_research`) use status = 'queued' for queued investigations.

  But table `research_queue` had a check constraint that only allowed:
  - pending
  - in_progress
  - completed
  - cancelled

  This produced error 23514 when trying to add second research to queue:
  `violates check constraint "research_queue_status_check"`.

  ## Fix
  1. Update check constraint to allow `queued`.
  2. Keep `pending` allowed for backward compatibility.
  3. Migrate existing `pending` rows to `queued` so frontend and RPCs are consistent.
*/

ALTER TABLE public.research_queue
DROP CONSTRAINT IF EXISTS research_queue_status_check;

ALTER TABLE public.research_queue
ADD CONSTRAINT research_queue_status_check
CHECK (
  status = ANY (ARRAY['queued', 'pending', 'in_progress', 'completed', 'cancelled'])
);

UPDATE public.research_queue
SET status = 'queued'
WHERE status = 'pending';
