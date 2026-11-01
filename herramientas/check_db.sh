#!/bin/bash
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id, deposit_wallet_address, contract_address, usdt_contract_address, is_usdt_deposits_enabled, is_deposits_enabled FROM public.wallet_config WHERE id = 1;"
