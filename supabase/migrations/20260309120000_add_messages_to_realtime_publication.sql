-- Add messages table to supabase_realtime publication
-- so Realtime postgres_changes events are emitted to the frontend
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
