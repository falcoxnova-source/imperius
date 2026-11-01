#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.wallet_config SET deposit_wallet_address = '4a17700792cc7b903c2f27225f9f868e7054f7c1bada741292fec756d8a9f9bf', is_usdt_deposits_enabled = false, is_deposits_enabled = true, min_deposit = 1 WHERE id = 1;"
