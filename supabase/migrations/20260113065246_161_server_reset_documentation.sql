/*
  # Server Reset Documentation - January 13, 2026

  This migration documents the complete server reset that was performed.

  ## Summary
  - Total users preserved: 91
  - Users with referral relationships preserved: 38
  - All game progress reset to starting values

  ## What Was Reset:
  1. FXU Balance: All users set to 0
  2. Dark Matter: All users set to 0
  3. Points/Rankings: All reset to 0
  4. Battle Statistics: All reset to 0
  5. Buildings: All levels set to 0
  6. Technologies: All levels set to 0
  7. Ships: All quantities set to 0
  8. Defenses: All quantities set to 0
  9. Planet Resources: Reset to 500 metal, 500 crystal, 0 deuterium
  10. Fleets: All deleted
  11. Construction Queues: All cleared
  12. Messages: All deleted
  13. Market Listings/Transactions: All deleted
  14. Officers: All removed
  15. Alliances: All deleted
  16. Wallet Transactions: All deleted
  17. Admin Revenue: All deleted

  ## What Was Preserved:
  - User accounts (auth.users)
  - Profiles (username, email, avatar)
  - Referral codes and relationships
  - Admin status
  - Game settings

  ## Configuration Changes:
  - Default FXU balance for NEW users changed from 1000 to 0
*/

-- This migration is documentation only. All changes were applied via direct SQL.
-- No additional SQL needed.
SELECT 1;
