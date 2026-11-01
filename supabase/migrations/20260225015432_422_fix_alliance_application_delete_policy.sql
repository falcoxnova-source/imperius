/*
  # Fix Alliance Application Delete Policy

  1. Changes
    - Updated DELETE policy on `alliance_applications` to allow users to delete 
      their own applications regardless of status (not just pending ones)
    - This allows users to clean up old accepted/rejected applications when re-applying

  2. Security
    - Users can still only delete their OWN applications (auth.uid() = user_id check remains)
    - Alliance admins cannot delete other users' applications through this policy
*/

DROP POLICY IF EXISTS "Users can cancel own pending applications" ON alliance_applications;

CREATE POLICY "Users can delete own applications"
  ON alliance_applications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
