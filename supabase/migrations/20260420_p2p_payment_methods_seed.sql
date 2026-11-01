-- Seed de métodos de pago P2P
-- Fase 1: internos (FXU/USDT)
-- Fase 2 (base): global + Cuba (CUP/MLC/SaldoMovil)

INSERT INTO p2p_payment_methods (code, name, country_code, currency_code, method_type, requires_account, is_enabled, sort_order, notes)
VALUES
  ('internal_fxu',  'Saldo interno FXU',  NULL, 'FXU',  'internal', false, true, 1, 'Fase 1 activa'),
  ('internal_usdt', 'Saldo interno USDT', NULL, 'USDT', 'internal', false, true, 2, 'Fase 1 activa')
ON CONFLICT (code) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  sort_order = EXCLUDED.sort_order,
  notes = EXCLUDED.notes;

-- Globales (apagados por defecto hasta política/compliance)
INSERT INTO p2p_payment_methods (code, name, country_code, currency_code, method_type, requires_account, is_enabled, sort_order, notes)
VALUES
  ('bank_usd', 'Transferencia bancaria USD', NULL, 'USD', 'bank_transfer', true, false, 50, 'Fase 2'),
  ('bank_eur', 'Transferencia bancaria EUR', NULL, 'EUR', 'bank_transfer', true, false, 51, 'Fase 2'),
  ('cash_local', 'Efectivo local', NULL, 'LOCAL', 'cash', true, false, 90, 'Fase 2')
ON CONFLICT (code) DO NOTHING;

-- Cuba (base lista, deshabilitada hasta activar país/reglas)
INSERT INTO p2p_payment_methods (code, name, country_code, currency_code, method_type, requires_account, is_enabled, sort_order, notes)
VALUES
  ('cu_cup_transfer', 'Transferencia CUP', 'CU', 'CUP', 'bank_transfer', true, false, 100, 'Fase 2 Cuba'),
  ('cu_mlc',          'Transferencia MLC', 'CU', 'MLC', 'bank_transfer', true, false, 101, 'Fase 2 Cuba'),
  ('cu_saldomovil',   'Saldo Móvil',       'CU', 'CUP', 'mobile',        true, false, 102, 'Fase 2 Cuba')
ON CONFLICT (code) DO NOTHING;
