-- Añade un flag para evitar que process_fleet_arrival reprocese una flota
-- deploy que ya aterrizó en un planeta aliado (donde la carga se queda en la
-- flota para no permitir transferencia de recursos entre cuentas).
--
-- Sin este flag, el cron reejecutaba la rama "planeta aliado" cada minuto
-- e insertaba los mensajes "Flota Estacionada" y "Flota Aliada Estacionada"
-- indefinidamente (spam masivo).

ALTER TABLE fleets
  ADD COLUMN IF NOT EXISTS arrival_notified boolean NOT NULL DEFAULT false;

-- Backfill: todas las flotas deploy ya aterrizadas en planeta ajeno
-- (no propio, no retornando, no completadas) se marcan como notificadas
-- para no volver a dispararles mensajes.
UPDATE fleets f
SET arrival_notified = true
WHERE f.mission_type = 'deploy'
  AND NOT f.is_returning
  AND NOT f.is_completed
  AND f.arrival_time <= NOW()
  AND NOT EXISTS (
    SELECT 1 FROM planets p
    WHERE p.user_id = f.user_id
      AND p.galaxy = f.target_galaxy
      AND p.solar_system = f.target_system
      AND p.position = f.target_position
  );
