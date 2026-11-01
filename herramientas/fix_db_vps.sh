#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.wallet_config SET deposit_wallet_address = '0x387526aa3f94f5C41e6a47D8c98751273e2214A3', contract_address = '0x09514EcF8270C12101D077B5e8B034B164F71C5f', is_usdt_deposits_enabled = false, is_deposits_enabled = true WHERE id = 1;"
