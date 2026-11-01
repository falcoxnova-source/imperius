const { Client } = require('pg');
const crypto = require('crypto');

const BOT_COUNT = 300;
const RANK_MIN = 50;
const RANK_MAX = 700;
const EXECUTE = process.argv.includes('--execute');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function splitPoints(total) {
  const b = Math.floor(total * 0.34);
  const r = Math.floor(total * 0.20);
  const f = Math.floor(total * 0.36);
  const d = total - b - r - f;
  return { b, r, f, d };
}

function cfgByPoints(points) {
  if (points >= 200000) {
    return {
      planets: 3,
      buildings: {
        metal_mine: 30, crystal_mine: 27, deuterium_synthesizer: 24, solar_plant: 30,
        robotics_factory: 12, shipyard: 12, research_lab: 12,
        metal_storage: 8, crystal_storage: 8, deuterium_tank: 8, nanite_factory: 2
      },
      techs: {
        energy_tech: 14, combustion_drive: 12, espionage_tech: 10, computer_tech: 11,
        armour_tech: 12, weapons_tech: 12, shielding_tech: 10, impulse_drive: 10,
        laser_tech: 12, ion_tech: 8, astrophysics: 7, hyperspace_tech: 8,
        plasma_tech: 7, hyperspace_drive: 8
      },
      ships: {
        light_fighter: 1400, heavy_fighter: 700, cruiser: 260, battleship: 160,
        battlecruiser: 90, bomber: 75, destroyer: 55,
        small_cargo: 350, large_cargo: 220, recycler: 140, espionage_probe: 100, colony_ship: 2
      },
      defenses: {
        rocket_launcher: 2200, light_laser: 1400, heavy_laser: 800,
        gauss_cannon: 320, ion_cannon: 360, plasma_turret: 140,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  if (points >= 120000) {
    return {
      planets: 2,
      buildings: {
        metal_mine: 27, crystal_mine: 24, deuterium_synthesizer: 21, solar_plant: 27,
        robotics_factory: 10, shipyard: 10, research_lab: 10,
        metal_storage: 7, crystal_storage: 7, deuterium_tank: 7, nanite_factory: 1
      },
      techs: {
        energy_tech: 12, combustion_drive: 10, espionage_tech: 8, computer_tech: 9,
        armour_tech: 10, weapons_tech: 10, shielding_tech: 8, impulse_drive: 8,
        laser_tech: 10, ion_tech: 6, astrophysics: 5, hyperspace_tech: 6,
        plasma_tech: 5, hyperspace_drive: 6
      },
      ships: {
        light_fighter: 900, heavy_fighter: 450, cruiser: 170, battleship: 95,
        battlecruiser: 50, bomber: 40, destroyer: 30,
        small_cargo: 240, large_cargo: 130, recycler: 85, espionage_probe: 70, colony_ship: 1
      },
      defenses: {
        rocket_launcher: 1400, light_laser: 900, heavy_laser: 500,
        gauss_cannon: 190, ion_cannon: 210, plasma_turret: 70,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  if (points >= 70000) {
    return {
      planets: 2,
      buildings: {
        metal_mine: 24, crystal_mine: 21, deuterium_synthesizer: 18, solar_plant: 24,
        robotics_factory: 9, shipyard: 9, research_lab: 9,
        metal_storage: 6, crystal_storage: 6, deuterium_tank: 6
      },
      techs: {
        energy_tech: 10, combustion_drive: 8, espionage_tech: 7, computer_tech: 8,
        armour_tech: 8, weapons_tech: 8, shielding_tech: 7, impulse_drive: 7,
        laser_tech: 8, ion_tech: 5, astrophysics: 4, hyperspace_tech: 5,
        plasma_tech: 4, hyperspace_drive: 5
      },
      ships: {
        light_fighter: 620, heavy_fighter: 300, cruiser: 100, battleship: 55,
        battlecruiser: 25, bomber: 20, destroyer: 15,
        small_cargo: 170, large_cargo: 90, recycler: 50, espionage_probe: 45, colony_ship: 1
      },
      defenses: {
        rocket_launcher: 900, light_laser: 580, heavy_laser: 310,
        gauss_cannon: 100, ion_cannon: 120, plasma_turret: 35,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  if (points >= 30000) {
    return {
      planets: 1,
      buildings: {
        metal_mine: 21, crystal_mine: 18, deuterium_synthesizer: 15, solar_plant: 21,
        robotics_factory: 7, shipyard: 7, research_lab: 7,
        metal_storage: 5, crystal_storage: 5, deuterium_tank: 5
      },
      techs: {
        energy_tech: 8, combustion_drive: 7, espionage_tech: 6, computer_tech: 6,
        armour_tech: 7, weapons_tech: 7, shielding_tech: 5, impulse_drive: 5,
        laser_tech: 7, ion_tech: 4, astrophysics: 3, hyperspace_tech: 4,
        plasma_tech: 3, hyperspace_drive: 4
      },
      ships: {
        light_fighter: 280, heavy_fighter: 130, cruiser: 42, battleship: 20,
        battlecruiser: 9, bomber: 8, destroyer: 6,
        small_cargo: 85, large_cargo: 40, recycler: 22, espionage_probe: 26, colony_ship: 1
      },
      defenses: {
        rocket_launcher: 420, light_laser: 240, heavy_laser: 120,
        gauss_cannon: 35, ion_cannon: 42, plasma_turret: 11,
        small_shield_dome: 1, large_shield_dome: 1
      }
    };
  }
  if (points >= 10000) {
    return {
      planets: 1,
      buildings: {
        metal_mine: 18, crystal_mine: 15, deuterium_synthesizer: 12, solar_plant: 18,
        robotics_factory: 6, shipyard: 6, research_lab: 6,
        metal_storage: 4, crystal_storage: 4, deuterium_tank: 4
      },
      techs: {
        energy_tech: 7, combustion_drive: 6, espionage_tech: 5, computer_tech: 5,
        armour_tech: 6, weapons_tech: 6, shielding_tech: 4, impulse_drive: 4,
        laser_tech: 6, ion_tech: 3, astrophysics: 2, hyperspace_tech: 3,
        plasma_tech: 2, hyperspace_drive: 3
      },
      ships: {
        light_fighter: 130, heavy_fighter: 50, cruiser: 14, battleship: 6,
        small_cargo: 45, large_cargo: 18, recycler: 9, espionage_probe: 14, colony_ship: 0
      },
      defenses: {
        rocket_launcher: 180, light_laser: 95, heavy_laser: 35,
        gauss_cannon: 8, ion_cannon: 12, plasma_turret: 2,
        small_shield_dome: 1, large_shield_dome: 0
      }
    };
  }

  return {
    planets: 1,
    buildings: {
      metal_mine: 15, crystal_mine: 12, deuterium_synthesizer: 10, solar_plant: 15,
      robotics_factory: 5, shipyard: 5, research_lab: 5,
      metal_storage: 3, crystal_storage: 3, deuterium_tank: 3
    },
    techs: {
      energy_tech: 6, combustion_drive: 5, espionage_tech: 4, computer_tech: 4,
      armour_tech: 5, weapons_tech: 5, shielding_tech: 3, impulse_drive: 3,
      laser_tech: 5, ion_tech: 2, astrophysics: 1, hyperspace_tech: 2,
      plasma_tech: 1, hyperspace_drive: 2
    },
    ships: {
      light_fighter: 70, heavy_fighter: 20, cruiser: 4, battleship: 1,
      small_cargo: 24, large_cargo: 8, recycler: 4, espionage_probe: 8, colony_ship: 0
    },
    defenses: {
      rocket_launcher: 110, light_laser: 45, heavy_laser: 14,
      gauss_cannon: 2, ion_cannon: 4, plasma_turret: 0,
      small_shield_dome: 1, large_shield_dome: 0
    }
  };
}

function buildUsername(existing) {
  const a = ['Ari', 'Nox', 'Zan', 'Kai', 'Lio', 'Tyr', 'Vex', 'Ryn', 'Dax', 'Neo', 'Ivo', 'Mik', 'Sora', 'Tano', 'Brax', 'Luna', 'Zoe', 'Nia', 'Rhea', 'Axel'];
  const b = ['dor', 'ven', 'rak', 'ion', 'zar', 'tek', 'mir', 'vos', 'lyn', 'kan', 'dra', 'hex', 'sol', 'nyx', 'fer', 'val', 'zen', 'tor', 'rus', 'kyo'];
  let u = '';
  do {
    u = a[randInt(0, a.length - 1)] + b[randInt(0, b.length - 1)] + (Math.random() < 0.45 ? String(randInt(11, 98)) : '');
  } while (existing.has(u.toLowerCase()));
  existing.add(u.toLowerCase());
  return u;
}

function makeEmail(username) {
  return `${username.toLowerCase()}_${crypto.randomBytes(3).toString('hex')}@falcox.local`;
}

async function main() {
  await client.connect();
  console.log(`Modo: ${EXECUTE ? 'EJECUCION REAL' : 'SIMULACION (no inserta)'}`);

  const profilesRes = await client.query(`SELECT id, username, COALESCE(points_total,0) AS points_total FROM profiles ORDER BY COALESCE(points_total,0) DESC`);
  const planetsRes = await client.query(`SELECT galaxy, solar_system, position FROM planets WHERE planet_type='planet' AND NOT is_destroyed`);
  const btypesRes = await client.query(`SELECT id, code FROM building_types`);
  const ttypesRes = await client.query(`SELECT id, code FROM technology_types`);
  const stypesRes = await client.query(`SELECT id, code FROM ship_types`);
  const dtypesRes = await client.query(`SELECT id, code FROM defense_types`);

  const ranking = profilesRes.rows;
  if (ranking.length < RANK_MAX) {
    throw new Error(`No hay suficientes perfiles (${ranking.length}) para mapear rango ${RANK_MAX}`);
  }

  const existingUsernames = new Set(ranking.map(r => (r.username || '').toLowerCase()));
  const occupied = new Set(planetsRes.rows.map(p => `${p.galaxy}:${p.solar_system}:${p.position}`));

  const idByBuilding = Object.fromEntries(btypesRes.rows.map(r => [r.code, r.id]));
  const idByTech = Object.fromEntries(ttypesRes.rows.map(r => [r.code, r.id]));
  const idByShip = Object.fromEntries(stypesRes.rows.map(r => [r.code, r.id]));
  const idByDefense = Object.fromEntries(dtypesRes.rows.map(r => [r.code, r.id]));

  const candidateRanks = [];
  for (let r = RANK_MIN; r <= RANK_MAX; r++) candidateRanks.push(r);
  shuffle(candidateRanks);
  const pickedRanks = candidateRanks.slice(0, BOT_COUNT).sort((a, b) => a - b);

  const freeCoords = [];
  for (let g = 1; g <= 5; g++) {
    const maxSS = 499;
    for (let s = 1; s <= maxSS; s++) {
      for (let p = 4; p <= 12; p++) {
        const key = `${g}:${s}:${p}`;
        if (!occupied.has(key)) freeCoords.push({ galaxy: g, solar_system: s, position: p, key });
      }
    }
  }
  shuffle(freeCoords);

  if (freeCoords.length < BOT_COUNT) {
    throw new Error(`No hay coordenadas libres suficientes: ${freeCoords.length}`);
  }

  const plan = pickedRanks.map((rank, idx) => {
    const base = Number(ranking[rank - 1]?.points_total || 1000);
    const variance = 1 + ((Math.random() * 0.08) - 0.04);
    const targetPoints = Math.max(1000, Math.floor(base * variance));
    const username = buildUsername(existingUsernames);
    const email = makeEmail(username);
    const cfg = cfgByPoints(targetPoints);

    return {
      idx: idx + 1,
      rank,
      username,
      email,
      targetPoints,
      cfg
    };
  }).sort((a, b) => b.targetPoints - a.targetPoints);

  console.log(`Bots a crear: ${plan.length}`);
  console.log(`Ejemplo top5:`, plan.slice(0, 5).map(x => `${x.username}(${x.targetPoints})@R${x.rank}`).join(', '));

  if (!EXECUTE) {
    console.log('Simulación finalizada. Usa --execute para insertar.');
    await client.end();
    return;
  }

  let coordPtr = 0;
  let created = 0;

  for (const bot of plan) {
    const userId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const pts = splitPoints(bot.targetPoints);

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO auth.users (
          id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          is_sso_user, is_anonymous
        ) VALUES (
          $1, 'authenticated', 'authenticated', $2, '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          now(), now(), false, false
        )`,
        [userId, bot.email]
      );

      await client.query(
        `INSERT INTO profiles (
          id, username, email, is_bot, points_total, points_buildings, points_research,
          points_fleet, points_defense, rank_position, is_admin, is_banned,
          vacation_mode, created_at, updated_at, last_activity, email_verified, is_hidden
        ) VALUES (
          $1, $2, $3, true, $4, $5, $6, $7, $8, 0, false, false,
          false, now(), now(), now(), true, false
        )
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          is_bot = true,
          points_total = EXCLUDED.points_total,
          points_buildings = EXCLUDED.points_buildings,
          points_research = EXCLUDED.points_research,
          points_fleet = EXCLUDED.points_fleet,
          points_defense = EXCLUDED.points_defense,
          email_verified = true,
          updated_at = now(),
          last_activity = now()`,
        [userId, bot.username, bot.email, bot.targetPoints, pts.b, pts.r, pts.f, pts.d]
      );

      const planetsToCreate = Math.max(1, bot.cfg.planets);
      const createdPlanets = [];

      for (let pi = 0; pi < planetsToCreate; pi++) {
        if (coordPtr >= freeCoords.length) throw new Error('Sin coordenadas libres');
        const c = freeCoords[coordPtr++];
        const pname = pi === 0 ? `${bot.username} Prime` : `${bot.username} C${pi + 1}`;

        const pRes = await client.query(
          `INSERT INTO planets (
            user_id, name, galaxy, solar_system, position, planet_type, image_id,
            diameter, fields_used, fields_max, temp_min, temp_max, is_main_planet,
            is_destroyed, last_update, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'planet', $6,
            $7, $8, $9, $10, $11, $12,
            false, now(), now()
          ) RETURNING id`,
          [
            userId, pname, c.galaxy, c.solar_system, c.position,
            randInt(1, 15), randInt(11800, 19800),
            Object.values(bot.cfg.buildings).filter(v => v > 0).length,
            randInt(180, 260), randInt(-125, -35), randInt(-40, 28), pi === 0
          ]
        );

        const planetId = pRes.rows[0].id;
        createdPlanets.push(planetId);

        const baseRes = Math.max(30000, Math.floor(bot.targetPoints * 1.8));
        await client.query(
          `INSERT INTO planet_resources (
            planet_id, metal, crystal, deuterium, energy_used, energy_max,
            metal_per_hour, crystal_per_hour, deuterium_per_hour,
            metal_storage, crystal_storage, deuterium_storage, last_update
          ) VALUES (
            $1, $2, $3, $4, 0, $5,
            $6, $7, $8,
            $9, $10, $11, now()
          )`,
          [
            planetId,
            Math.floor(baseRes * (0.9 + Math.random() * 0.5)),
            Math.floor(baseRes * (0.45 + Math.random() * 0.28)),
            Math.floor(baseRes * (0.35 + Math.random() * 0.25)),
            Math.floor(baseRes * 0.2),
            Math.floor(baseRes * 0.06),
            Math.floor(baseRes * 0.03),
            Math.floor(baseRes * 0.02),
            Math.floor(baseRes * 12),
            Math.floor(baseRes * 9),
            Math.floor(baseRes * 8)
          ]
        );

        for (const [code, lvl] of Object.entries(bot.cfg.buildings)) {
          const id = idByBuilding[code];
          if (!id || lvl <= 0) continue;
          await client.query(
            `INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading, created_at)
             VALUES ($1, $2, $3, false, now())`,
            [planetId, id, lvl]
          );
        }

        // distribute fleet/defense mostly on main planet
        const factor = pi === 0 ? 0.72 : (planetsToCreate === 2 ? 0.28 : 0.14);
        for (const [code, qty] of Object.entries(bot.cfg.ships)) {
          const id = idByShip[code];
          if (!id || qty <= 0) continue;
          const q = Math.max(0, Math.floor(qty * factor));
          if (q <= 0) continue;
          await client.query(
            `INSERT INTO planet_ships (planet_id, ship_type_id, quantity, in_construction, created_at)
             VALUES ($1, $2, $3, 0, now())`,
            [planetId, id, q]
          );
        }

        for (const [code, qty] of Object.entries(bot.cfg.defenses)) {
          const id = idByDefense[code];
          if (!id || qty <= 0) continue;
          const q = Math.max(0, Math.floor(qty * factor));
          if (q <= 0) continue;
          await client.query(
            `INSERT INTO planet_defenses (planet_id, defense_type_id, quantity, in_construction, created_at)
             VALUES ($1, $2, $3, 0, now())`,
            [planetId, id, q]
          );
        }
      }

      for (const [code, lvl] of Object.entries(bot.cfg.techs)) {
        const id = idByTech[code];
        if (!id || lvl <= 0) continue;
        await client.query(
          `INSERT INTO user_technologies (
            user_id, technology_type_id, level, is_researching,
            research_end_time, research_planet_id, created_at, research_start_time
          ) VALUES (
            $1, $2, $3, false, null, $4, now(), null
          )`,
          [userId, id, lvl, createdPlanets[0]]
        );
      }

      await client.query('COMMIT');
      created++;

      if (created % 25 === 0) {
        console.log(`Creados ${created}/${BOT_COUNT}...`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Error creando ${bot.username}:`, err.message);
    }
  }

  console.log(`\nProceso terminado. Bots creados: ${created}/${BOT_COUNT}`);
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await client.end(); } catch (_) {}
  process.exit(1);
});
