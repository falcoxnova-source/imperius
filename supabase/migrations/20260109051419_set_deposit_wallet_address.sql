/*
  # Set Deposit Wallet Address
  
  Updates the wallet_config table with the correct deposit wallet address.
  
  This is the address derived from the private key that users will send tokens to.
  Address: 0x9b5511eF467B977c2EA3865F14b4459D81Bb98D2
*/

UPDATE wallet_config 
SET deposit_wallet_address = '0x9b5511eF467B977c2EA3865F14b4459D81Bb98D2',
    updated_at = now()
WHERE id = 1;
