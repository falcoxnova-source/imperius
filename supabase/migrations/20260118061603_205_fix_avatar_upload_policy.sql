-- Fix Avatar Upload Policy
-- Drop and recreate the INSERT policy for avatars bucket with proper WITH CHECK

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
