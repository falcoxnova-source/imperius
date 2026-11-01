/*
  # Allow users to update their twitter username
  
  Adds an UPDATE policy on twitter_links so users can correct
  their twitter_username if they made a typo when linking.
  Only allows updating twitter_username column on own row.
*/

-- Allow users to update their own twitter link (to correct username typos)
DROP POLICY IF EXISTS "Users can update own twitter link" ON twitter_links;
CREATE POLICY "Users can update own twitter link"
  ON twitter_links FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
