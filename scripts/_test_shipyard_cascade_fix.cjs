// Simula el escenario del bug: Destructor + 5 Estrellas de la Muerte,
// reconexión 4h después de que terminó el Destructor.
// Verifica que solo el Destructor + a lo sumo 1 Estrella se completen.

const pg = require('pg');
const c = new pg.Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  try {
    // 1) Buscar un planeta de prueba con hangar y un ship_type_id válido
    const planet = await c.query(
      `select pb.planet_id as planet_id, p.user_id
       from planet_buildings pb
       join planets p on p.id = pb.planet_id
       join building_types bt on bt.id = pb.building_type_id
       where bt.code='shipyard' and pb.level >= 5
       limit 1`
    );
    if (!planet.rows[0]) throw new Error('No planets with shipyard >= 5');
    const { planet_id, user_id } = planet.rows[0];

    const st = await c.query(
      `select id from ship_types order by build_time_seconds limit 2`
    );
    if (st.rows.length < 2) throw new Error('Need at least 2 ship_types');
    const destructor_type = st.rows[0].id;
    const deathstar_type = st.rows[1].id;

    console.log('Test planet:', planet_id);

    // 2) Limpiar cola previa de prueba
    await c.query(`delete from shipyard_queue where planet_id = $1`, [planet_id]);

    // Desactivar triggers de validación para insertar datos sintéticos
    await c.query(`set session_replication_role = 'replica'`);

    // 3) Insertar Destructor que terminó hace 4 horas (start_time = NOW - 5h, build = 1h)
    //    + 5 Estrellas (build_time = 30 min cada una) en posiciones 2..6
    const fiveHoursAgo = `NOW() - INTERVAL '5 hours'`;
    const oneHourAgo = `NOW() - INTERVAL '4 hours'`;

    await c.query(`
      insert into shipyard_queue (
        planet_id, item_type, ship_type_id,
        quantity, quantity_completed, build_time_per_unit,
        queue_position, start_time, current_unit_end_time,
        metal_cost, crystal_cost, deuterium_cost
      ) values
      ($1,'ship',$2, 1, 0, 3600, 1, ${fiveHoursAgo}, ${oneHourAgo}, 0,0,0),
      ($1,'ship',$3, 1, 0, 1800, 2, NULL, NULL, 0,0,0),
      ($1,'ship',$3, 1, 0, 1800, 3, NULL, NULL, 0,0,0),
      ($1,'ship',$3, 1, 0, 1800, 4, NULL, NULL, 0,0,0),
      ($1,'ship',$3, 1, 0, 1800, 5, NULL, NULL, 0,0,0),
      ($1,'ship',$3, 1, 0, 1800, 6, NULL, NULL, 0,0,0)
    `, [planet_id, destructor_type, deathstar_type]);

    // Reactivar triggers para que la función real se ejecute con todas las reglas
    await c.query(`set session_replication_role = 'origin'`);

    // 4) Snapshot de planet_ships ANTES
    const before = await c.query(
      `select ship_type_id, quantity from planet_ships where planet_id=$1
       and ship_type_id in ($2,$3)`,
      [planet_id, destructor_type, deathstar_type]
    );
    const beforeMap = Object.fromEntries(before.rows.map(r => [r.ship_type_id, Number(r.quantity)]));

    // 5) Llamar a la función parcheada
    const res = await c.query(
      `select process_shipyard_queue_internal($1,$2) as r`,
      [planet_id, user_id]
    );
    console.log('Function result:', res.rows[0].r);

    // 6) Snapshot de planet_ships DESPUÉS
    const after = await c.query(
      `select ship_type_id, quantity from planet_ships where planet_id=$1
       and ship_type_id in ($2,$3)`,
      [planet_id, destructor_type, deathstar_type]
    );
    const afterMap = Object.fromEntries(after.rows.map(r => [r.ship_type_id, Number(r.quantity)]));

    const destDelta = (afterMap[destructor_type]||0) - (beforeMap[destructor_type]||0);
    const dsDelta = (afterMap[deathstar_type]||0) - (beforeMap[deathstar_type]||0);
    console.log(`Destructor completados: ${destDelta} (esperado: 1)`);
    console.log(`Estrellas completadas:  ${dsDelta} (esperado: 0)`);

    // 7) Estado de la cola tras el procesamiento
    const queue = await c.query(
      `select queue_position, ship_type_id, quantity, quantity_completed,
              start_time, current_unit_end_time
       from shipyard_queue where planet_id=$1
       order by queue_position`,
      [planet_id]
    );
    console.log('\nCola después:');
    for (const row of queue.rows) {
      const isDS = row.ship_type_id === deathstar_type;
      console.log(`  pos=${row.queue_position} type=${isDS?'EstrellaDM':'Destructor'} qty=${row.quantity_completed}/${row.quantity} start=${row.start_time?.toISOString?.()||'NULL'} end=${row.current_unit_end_time?.toISOString?.()||'NULL'}`);
    }

    // 8) Veredicto
    const ok = destDelta === 1 && dsDelta === 0
      && queue.rows.length === 5
      && queue.rows[0].queue_position === 1
      && queue.rows[0].start_time !== null;

    console.log('\n' + (ok ? '✅ FIX VERIFICADO' : '❌ FIX NO FUNCIONA'));

    // 9) Limpiar cola de prueba
    await c.query(`delete from shipyard_queue where planet_id = $1`, [planet_id]);
    // Revertir las naves añadidas en la prueba
    if (destDelta > 0) {
      await c.query(
        `update planet_ships set quantity = quantity - $1
         where planet_id=$2 and ship_type_id=$3`,
        [destDelta, planet_id, destructor_type]
      );
    }
    if (dsDelta > 0) {
      await c.query(
        `update planet_ships set quantity = quantity - $1
         where planet_id=$2 and ship_type_id=$3`,
        [dsDelta, planet_id, deathstar_type]
      );
    }
    console.log('Cleanup OK.');
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
