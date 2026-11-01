/*
  # Public Chat System

  1. New Tables
    - `public_chat_messages`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `username` (text, denormalized for performance)
      - `avatar_url` (text, denormalized for performance)
      - `alliance_tag` (text, optional)
      - `message` (text, the chat message)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `public_chat_messages` table
    - Authenticated users can read all messages
    - Authenticated users can insert their own messages
    - Users cannot update or delete messages (permanent chat history)

  3. Features
    - Auto-cleanup of old messages (keep last 500)
    - Indexes for efficient querying
*/

-- Create public chat messages table
CREATE TABLE IF NOT EXISTS public_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  avatar_url text,
  alliance_tag text,
  message text NOT NULL CHECK (char_length(message) > 0 AND char_length(message) <= 500),
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_public_chat_messages_created_at 
  ON public_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all messages
CREATE POLICY "Authenticated users can read public chat"
  ON public_chat_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert their own messages
CREATE POLICY "Authenticated users can send public chat messages"
  ON public_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to send a public chat message
CREATE OR REPLACE FUNCTION send_public_chat_message(p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_avatar_url text;
  v_alliance_tag text;
  v_message_id uuid;
  v_is_vacation boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check vacation mode
  SELECT vacation_mode INTO v_is_vacation
  FROM profiles
  WHERE id = v_user_id;
  
  IF v_is_vacation THEN
    RAISE EXCEPTION 'Cannot send messages while in vacation mode';
  END IF;
  
  -- Validate message
  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;
  
  IF char_length(p_message) > 500 THEN
    RAISE EXCEPTION 'Message too long (max 500 characters)';
  END IF;
  
  -- Get user info
  SELECT username, avatar_url INTO v_username, v_avatar_url
  FROM profiles
  WHERE id = v_user_id;
  
  -- Get alliance tag if member of alliance
  SELECT a.tag INTO v_alliance_tag
  FROM alliance_members am
  JOIN alliances a ON a.id = am.alliance_id
  WHERE am.user_id = v_user_id;
  
  -- Insert message
  INSERT INTO public_chat_messages (user_id, username, avatar_url, alliance_tag, message)
  VALUES (v_user_id, v_username, v_avatar_url, v_alliance_tag, trim(p_message))
  RETURNING id INTO v_message_id;
  
  -- Cleanup old messages (keep last 500)
  DELETE FROM public_chat_messages
  WHERE id NOT IN (
    SELECT id FROM public_chat_messages
    ORDER BY created_at DESC
    LIMIT 500
  );
  
  RETURN v_message_id;
END;
$$;

-- Enable realtime for public chat
ALTER PUBLICATION supabase_realtime ADD TABLE public_chat_messages;
